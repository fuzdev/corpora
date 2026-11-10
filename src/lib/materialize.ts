/**
 * Materializes `collections/` from `manifest.json`, or checks that the committed tree
 * still reproduces from it.
 *
 * Write mode (default): for each selected collection, resolve a git directory holding
 * the pinned commit, list the tree under its subpaths, keep the included files, copy
 * their bytes verbatim, add the LICENSE, and record the result in `lock.json`.
 *
 * `check`: materialize in memory instead and compare it byte for byte with the
 * committed `collections/`, and the recomputed lock entries with `lock.json`. Any
 * difference is a problem — the snapshot is a fixed point of the manifest, or it is wrong.
 *
 * A full run (no `only`) also owns what the manifest no longer names: a
 * `collections/<name>` directory or a lock entry with no manifest collection is a removed
 * collection's leftover — a problem in `check`, deleted (the directory) or dropped
 * (the lock entry) in write mode — so removing a collection is a one-line manifest edit,
 * and a stale tree cannot sit under a green check.
 *
 * `only` limits either mode to some collections; in write mode the other collections'
 * lock entries are kept as they are, and leftovers are not touched.
 *
 * @module
 */

import * as s from '@fuzdev/fuz_schema/schema.ts';
import type { FsDir } from '@fuzdev/gro/fs.ts';
import type { FsPaths } from '@fuzdev/gro/fs_paths.ts';
import type { SpawnProgram } from '@fuzdev/gro/spawn.ts';
import { TaskError } from '@fuzdev/gro/task.ts';

import {
	MANIFEST_VERSION,
	load_manifest,
	parse_json_text,
	type Collection,
	type Manifest
} from './manifest.ts';
import { resolve_source } from './source.ts';
import {
	LockEntry,
	diff_trees,
	lock_entry,
	materialize_collection,
	read_tree,
	write_collection
} from './snapshot.ts';

export const MANIFEST_PATH = 'manifest.json';
export const LOCK_PATH = 'lock.json';
export const COLLECTIONS_PATH = 'collections';

export interface MaterializeDeps {
	git: SpawnProgram;
	/** The repo: holds the manifest, the lock, `collections/`, and the cache. */
	project: FsDir;
	/** Opens the sibling checkouts, outside the project. */
	fs_paths: Pick<FsPaths, 'open_dir_path'>;
	log: (message: string) => void;
}

export interface MaterializeOptions {
	check: boolean;
	/** Collection names, all of them when empty. */
	only: ReadonlyArray<string>;
	/** The directory sibling checkouts live in, relative to the project or absolute. */
	siblings_path: string;
}

export interface MaterializeResult {
	/** One summary line per selected collection, then the total. */
	rows: Array<string>;
	/** With `check`, each difference found; empty means the snapshot reproduces. */
	problems: Array<string>;
}

const Lock = s.object({
	version: s.number,
	collections: s.record(LockEntry)
});
type Lock = s.Infer<typeof Lock>;

const read_lock = async (project: FsDir): Promise<Lock> => {
	const text = await project.read_text_if_exists(LOCK_PATH);
	if (text === null) return { version: MANIFEST_VERSION, collections: {} };
	return parse_json_text(
		Lock,
		LOCK_PATH,
		text,
		`Delete ${LOCK_PATH} and run \`npm run materialize\` to regenerate it.`
	);
};

const format_bytes = (n: number): string => `${(n / 1e6).toFixed(1)} MB`;

const to_row = (collection: Collection, entry: LockEntry): string =>
	`${collection.name.padEnd(18)} ${collection.commit.slice(0, 9)}  ${String(entry.files).padStart(5)} files  ${format_bytes(entry.bytes).padStart(8)}  ${collection.shaped_by.padEnd(8)} ${collection.origin.padEnd(11)} ${collection.license.spdx}`;

const select_collections = (manifest: Manifest, only: ReadonlyArray<string>): Array<Collection> =>
	only.length === 0
		? manifest.collections
		: only.map((name) => {
				const collection = manifest.collections.find((c) => c.name === name);
				if (!collection) {
					throw new TaskError(`no collection named ${name}`);
				}
				return collection;
			});

/** Names under `collections/` that no manifest collection names, sorted. */
const list_leftovers = async (project: FsDir, names: Set<string>): Promise<Array<string>> => {
	const leftovers: Array<string> = [];
	if ((await project.stat(COLLECTIONS_PATH)) === null) return leftovers;
	for await (const entry of project.list(COLLECTIONS_PATH)) {
		if (!names.has(entry.name)) leftovers.push(entry.name);
	}
	return leftovers.sort();
};

/**
 * Runs one materialization.
 * @returns the summary rows and, with `check`, the differences; the caller decides how they exit
 * @mutates `collections/` and `lock.json` under `project` unless `check`
 * @throws TaskError - for an `only` naming no collection, an invalid manifest, a failing git,
 * or a license that doesn't verify
 */
export const materialize = async (
	{ git, project, fs_paths, log }: MaterializeDeps,
	{ check, only, siblings_path }: MaterializeOptions
): Promise<MaterializeResult> => {
	const manifest = await load_manifest(project, MANIFEST_PATH);
	const include = new Set(manifest.include);
	const selected = select_collections(manifest, only);
	const lock = await read_lock(project);
	const full_run = only.length === 0;

	if (!check) await project.mkdir(COLLECTIONS_PATH, { recursive: true, exists_ok: true });
	const collections_dir = check ? null : project.dir(COLLECTIONS_PATH);

	const problems: Array<string> = [];
	const rows: Array<string> = [];
	let total_files = 0;
	let total_bytes = 0;

	for (const collection of selected) {
		const source = await resolve_source({ git, project, fs_paths, log }, collection, {
			siblings_path
		});
		const materialized = await materialize_collection(git, collection, include, source);
		const entry = await lock_entry(collection.commit, materialized.files);
		total_files += entry.files;
		total_bytes += entry.bytes;
		for (const s of materialized.symlinks) log(`  ${collection.name}: skipped symlink ${s}`);
		for (const l of materialized.large) log(`  ${collection.name}: large file ${l}`);
		rows.push(to_row(collection, entry));

		if (collections_dir === null) {
			const committed = await read_tree(project, `${COLLECTIONS_PATH}/${collection.name}`);
			for (const p of diff_trees(materialized.files, committed)) {
				problems.push(`${collection.name}: ${p}`);
			}
			const locked = lock.collections[collection.name];
			if (!locked) problems.push(`${collection.name}: no lock.json entry`);
			else if (JSON.stringify(locked) !== JSON.stringify(entry)) {
				problems.push(
					`${collection.name}: lock.json entry is stale (${JSON.stringify(locked)} vs ${JSON.stringify(entry)})`
				);
			}
		} else {
			await write_collection(collections_dir, collection, materialized);
			lock.collections[collection.name] = entry;
		}
	}

	if (full_run) {
		const names = new Set(manifest.collections.map((c) => c.name));
		for (const leftover of await list_leftovers(project, names)) {
			if (check) {
				problems.push(
					`${COLLECTIONS_PATH}/${leftover}: not in manifest.json (a removed collection?)`
				);
			} else {
				await project.remove(`${COLLECTIONS_PATH}/${leftover}`, { recursive: true });
				log(`  removed ${COLLECTIONS_PATH}/${leftover} (not in manifest.json)`);
			}
		}
		if (check) {
			if (lock.version !== MANIFEST_VERSION) {
				problems.push(`lock.json: version ${lock.version} is not ${MANIFEST_VERSION}`);
			}
			for (const name of Object.keys(lock.collections)) {
				if (!names.has(name)) problems.push(`lock.json: entry "${name}" is not in manifest.json`);
			}
		}
	}

	if (!check) {
		const ordered: Record<string, LockEntry> = {};
		for (const c of manifest.collections) {
			const entry = lock.collections[c.name];
			if (entry) ordered[c.name] = entry;
		}
		// An `only` run leaves leftovers alone, the lock's included: a removed
		// collection's entry stays beside its directory until a full run drops both, so
		// the two never disagree about whether the collection is gone.
		if (!full_run) {
			for (const [name, entry] of Object.entries(lock.collections)) {
				if (!(name in ordered)) ordered[name] = entry;
			}
		}
		await project.write(
			LOCK_PATH,
			JSON.stringify({ version: MANIFEST_VERSION, collections: ordered }, null, '\t') + '\n'
		);
	}

	rows.push(
		`${'total'.padEnd(18)} ${''.padEnd(9)}  ${String(total_files).padStart(5)} files  ${format_bytes(total_bytes).padStart(8)}`
	);
	return { rows, problems };
};
