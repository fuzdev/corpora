/**
 * Materializes `collections/` from `manifest.json`, or checks that the committed tree
 * still reproduces from it.
 *
 * Write mode (default): for each selected collection, resolve a git directory holding
 * the pinned commit, list the tree under its subpaths, keep the included files, copy
 * their bytes verbatim, add the LICENSE, and record the result in `lock.json`.
 *
 * `--check`: materialize into a temp dir instead and compare it byte for byte with the
 * committed `collections/`, and the recomputed lock entries with `lock.json`. Any
 * difference exits 1 — the snapshot is a fixed point of the manifest, or it is wrong.
 *
 * `--only <name>` (repeatable) limits either mode to some collections; in write mode the
 * other collections' lock entries are kept as they are.
 *
 * @module
 */

import { join, resolve } from 'node:path';

import { MANIFEST_VERSION, load_manifest, type Collection } from './lib/manifest.ts';
import { resolve_source } from './lib/source.ts';
import {
	diff_trees,
	lock_entry,
	materialize_collection,
	read_tree,
	write_collection,
	type LockEntry
} from './lib/snapshot.ts';

interface Args {
	check: boolean;
	only: string[];
}

const parse_args = (argv: readonly string[]): Args => {
	const args: Args = { check: false, only: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--check') args.check = true;
		else if (a === '--only') {
			const name = argv[++i];
			if (!name) usage('--only needs a collection name');
			args.only.push(name);
		} else if (a === '--help' || a === '-h') usage();
		else usage(`unknown argument ${a}`);
	}
	return args;
};

const usage = (error?: string): never => {
	if (error) console.error(`error: ${error}\n`);
	console.error('usage: deno task materialize [--check] [--only <name>]...');
	Deno.exit(error ? 2 : 0);
};

interface Lock {
	version: number;
	collections: Record<string, LockEntry>;
}

const read_lock = async (path: string): Promise<Lock> => {
	try {
		return JSON.parse(await Deno.readTextFile(path)) as Lock;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound)
			return { version: MANIFEST_VERSION, collections: {} };
		throw error;
	}
};

const format_bytes = (n: number): string => `${(n / 1e6).toFixed(1)} MB`;

const main = async (): Promise<void> => {
	const args = parse_args(Deno.args);
	const root = Deno.cwd();
	const manifest = await load_manifest(join(root, 'manifest.json'));
	const include = new Set(manifest.include);
	const selected: Collection[] =
		args.only.length === 0
			? manifest.collections
			: args.only.map((name) => {
					const c = manifest.collections.find((c) => c.name === name);
					if (!c) usage(`no collection named ${name}`);
					return c!;
				});

	const collections_dir = join(root, 'collections');
	const lock_path = join(root, 'lock.json');
	const lock = await read_lock(lock_path);
	const out_root = args.check
		? await Deno.makeTempDir({ prefix: 'corpora-check-' })
		: collections_dir;
	const log = (m: string): void => console.error(m);
	const problems: string[] = [];
	const rows: string[] = [];
	let total_files = 0;
	let total_bytes = 0;

	try {
		for (const collection of selected) {
			const source = await resolve_source(collection, {
				siblings_dir: resolve(root, '..'),
				cache_dir: join(root, '.cache', 'repos'),
				log
			});
			const materialized = await materialize_collection(collection, include, source);
			const entry = await lock_entry(collection.commit, materialized.files);
			total_files += entry.files;
			total_bytes += entry.bytes;
			for (const s of materialized.symlinks) log(`  ${collection.name}: skipped symlink ${s}`);
			for (const l of materialized.large) log(`  ${collection.name}: large file ${l}`);
			rows.push(
				`${collection.name.padEnd(18)} ${collection.commit.slice(0, 9)}  ${String(entry.files).padStart(5)} files  ${format_bytes(entry.bytes).padStart(8)}  ${collection.shaped_by.padEnd(8)} ${collection.license.spdx}`
			);

			if (args.check) {
				const committed = await read_tree(join(collections_dir, collection.name));
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
				await write_collection(out_root, collection, materialized);
				lock.collections[collection.name] = entry;
			}
		}
	} finally {
		if (args.check) await Deno.remove(out_root, { recursive: true }).catch(() => {});
	}

	if (!args.check) {
		const ordered: Record<string, LockEntry> = {};
		for (const c of manifest.collections) {
			if (lock.collections[c.name]) ordered[c.name] = lock.collections[c.name];
		}
		await Deno.writeTextFile(
			lock_path,
			JSON.stringify({ version: MANIFEST_VERSION, collections: ordered }, null, '\t') + '\n'
		);
	}

	console.log(rows.join('\n'));
	console.log(
		`${'total'.padEnd(18)} ${''.padEnd(9)}  ${String(total_files).padStart(5)} files  ${format_bytes(total_bytes).padStart(8)}`
	);

	if (problems.length > 0) {
		console.error(
			`\n✗ ${problems.length} difference(s) between manifest.json and the committed snapshot:`
		);
		for (const p of problems.slice(0, 50)) console.error(`  ${p}`);
		if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`);
		console.error(
			'\nRun `deno task materialize` and commit the result if the manifest change was deliberate.'
		);
		Deno.exit(1);
	}
	if (args.check) console.error('\n✓ collections/ and lock.json reproduce from manifest.json');
};

await main();
