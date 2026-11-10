/**
 * Materializing one collection from git objects, and the on-disk questions the check
 * asks of the result: walking a tree, digesting it, comparing two trees.
 *
 * @module
 */

import { hash_sha256 } from '@fuzdev/fuz_util/hash.ts';
import { meta } from '@fuzdev/fuz_schema/meta.ts';
import * as s from '@fuzdev/fuz_schema/schema.ts';
import type { FsDir, FsReadDir } from '@fuzdev/gro/fs.ts';
import { fs_search } from '@fuzdev/gro/fs_search.ts';
import type { SpawnProgram } from '@fuzdev/gro/spawn.ts';
import { TaskError } from '@fuzdev/gro/task.ts';

import { git_cat_blobs, git_ls_tree, git_out_bytes, type GitTreeEntry } from './git.ts';
import {
	PERMISSIVE_LICENSES,
	is_included_path,
	parse_json_text,
	type Collection
} from './manifest.ts';

/** A file the snapshot holds, with its content. */
export interface SnapshotFile {
	/** Path relative to the collection root — the upstream repo-relative path. */
	path: string;
	content: Uint8Array;
}

/** What materializing one collection produced. */
export interface MaterializedCollection {
	files: Array<SnapshotFile>;
	/** Symlinks the filter would have kept, skipped: a snapshot holds bytes, not links. */
	symlinks: Array<string>;
	/** Files over `LARGE_FILE_BYTES`, reported so a stray bundle is noticed. */
	large: Array<string>;
}

/** Files at or above this size are listed in the summary. */
export const LARGE_FILE_BYTES = 512 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// an upstream's package.json carries whatever its project put there, so only `license` is read
const UpstreamPackageJson = s.strip_object({ license: s.optional(s.unknown) });

/** Code-unit order, so a digest never depends on the host's locale. */
const compare_paths = (a: { path: string }, b: { path: string }): number =>
	a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/**
 * Refuses to keep a path that isn't UTF-8: its lossy name is another file's, and two such
 * names would be one. A path the filters drop never comes here.
 * @throws TaskError - naming the collection and the lossy path
 */
const assert_kept_path_is_utf8 = (collection: Collection, entry: GitTreeEntry): void => {
	if (entry.path_is_utf8) return;
	throw new TaskError(
		`${collection.name}: kept path "${entry.path}" at ${collection.commit} isn't UTF-8, so it can't be vendored by name`
	);
};

/**
 * Builds a collection's files from the pinned commit in `source`: the filtered tree
 * under each subpath, the named `files`, and the LICENSE. Nothing is written here.
 * @throws TaskError - when a subpath matches nothing, a named file isn't a regular file,
 * a kept path isn't UTF-8, or the license doesn't verify
 */
export const materialize_collection = async (
	git: SpawnProgram,
	collection: Collection,
	include: ReadonlySet<string>,
	source: FsReadDir
): Promise<MaterializedCollection> => {
	const symlinks: Array<string> = [];
	const large: Array<string> = [];
	const kept: Array<{ path: string; oid: string }> = [];
	for (const subpath of collection.subpaths) {
		const before = kept.length;
		for (const entry of await git_ls_tree(git, source, collection.commit, subpath)) {
			if (!is_included_path(entry.path, include, collection.exclude)) continue;
			if (entry.mode === '120000') {
				symlinks.push(entry.path);
				continue;
			}
			assert_kept_path_is_utf8(collection, entry);
			if (entry.size >= LARGE_FILE_BYTES) large.push(entry.path);
			kept.push({ path: entry.path, oid: entry.oid });
		}
		if (kept.length === before) {
			throw new TaskError(
				`${collection.name}: subpath "${subpath}" matched no files — did the upstream layout change?`
			);
		}
	}
	for (const path of collection.files ?? []) {
		const entry = (await git_ls_tree(git, source, collection.commit, path)).find(
			(e) => e.path === path
		);
		if (!entry || entry.mode === '120000') {
			throw new TaskError(
				`${collection.name}: files "${path}" is not a regular file at ${collection.commit}`
			);
		}
		kept.push({ path: entry.path, oid: entry.oid });
	}
	const blobs = await git_cat_blobs(git, source, [...new Set(kept.map((k) => k.oid))]);
	const files: Array<SnapshotFile> = kept.map((k) => ({
		path: k.path,
		content: blobs.get(k.oid)!
	}));
	files.push({ path: 'LICENSE', content: await license_content(git, collection, source) });
	files.sort(compare_paths);
	return { files, symlinks, large };
};

/**
 * The bytes of `collections/<name>/LICENSE`: the upstream's license file verbatim, or,
 * for a `declared_in` license, a generated note that names the declaration. Both are
 * verified against the manifest's SPDX id — a wrong or missing license fails here.
 * @throws TaskError - when the license doesn't verify or isn't permissive
 */
export const license_content = async (
	git: SpawnProgram,
	collection: Collection,
	source: FsReadDir
): Promise<Uint8Array> => {
	const { license, commit, name, url } = collection;
	const marker = PERMISSIVE_LICENSES[license.spdx];
	if (!marker) throw new TaskError(`${name}: license ${license.spdx} is not permissive`);
	if ('file' in license) {
		const bytes = await git_out_bytes(git, source, [
			'cat-file',
			'blob',
			`${commit}:${license.file}`
		]);
		if (!marker.test(decoder.decode(bytes))) {
			throw new TaskError(`${name}: ${license.file} does not read as ${license.spdx}`);
		}
		return bytes;
	}
	const pkg_text = decoder.decode(
		await git_out_bytes(git, source, ['cat-file', 'blob', `${commit}:${license.declared_in}`])
	);
	const declared = parse_json_text(
		UpstreamPackageJson,
		`${name}: ${license.declared_in}`,
		pkg_text
	).license;
	if (declared !== license.spdx) {
		throw new TaskError(
			`${name}: ${license.declared_in} declares license ${JSON.stringify(declared)}, manifest says ${license.spdx}`
		);
	}
	return encoder.encode(
		`${license.spdx} (declared, not shipped as a file)\n\n` +
			`${name} declares "license": "${license.spdx}" in ${license.declared_in} at commit ${commit} ` +
			`and ships no license file at the repository root. The ${license.spdx} terms apply as ` +
			`declared by the upstream:\n${url}/blob/${commit}/${license.declared_in}\n`
	);
};

/** Writes a materialized collection under `collections_dir/<name>`, replacing whatever was there. */
export const write_collection = async (
	collections_dir: FsDir,
	collection: Collection,
	materialized: MaterializedCollection
): Promise<void> => {
	await collections_dir.remove(collection.name, { recursive: true, missing_ok: true });
	await collections_dir.mkdir(collection.name);
	const dir = collections_dir.dir(collection.name);
	const made: Set<string> = new Set();
	for (const file of materialized.files) {
		const slash = file.path.lastIndexOf('/');
		if (slash !== -1) {
			const parent = file.path.slice(0, slash);
			if (!made.has(parent)) {
				await dir.mkdir(parent, { recursive: true, exists_ok: true });
				made.add(parent);
			}
		}
		await dir.write(file.path, file.content);
	}
};

const count = s.pipe(s.number, s.safe_integer);

/** What the lock records per collection. */
export const LockEntry = s.object({
	commit: s.string,
	files: count,
	bytes: count,
	digest: meta(s.string, {
		description: "`sha256:` over every file's path and content digest, in path order"
	})
});
export type LockEntry = s.Infer<typeof LockEntry>;

/** Computes a collection's lock entry from its files (sorted by path). */
export const lock_entry = async (
	commit: string,
	files: ReadonlyArray<SnapshotFile>
): Promise<LockEntry> => {
	let bytes = 0;
	let manifest_text = '';
	for (const file of files) {
		bytes += file.content.byteLength;
		manifest_text += `${file.path}\0${await hash_sha256(file.content as Uint8Array<ArrayBuffer>)}\n`;
	}
	return {
		commit,
		files: files.length,
		bytes,
		digest: `sha256:${await hash_sha256(encoder.encode(manifest_text))}`
	};
};

/**
 * Every regular file under `path` beneath `dir`, as `SnapshotFile`s sorted by relative path;
 * empty when nothing is at `path`.
 * @throws TaskError - for an entry that's neither a regular file nor a directory
 */
export const read_tree = async (dir: FsReadDir, path: string): Promise<Array<SnapshotFile>> => {
	const files: Array<SnapshotFile> = [];
	for (const found of await fs_search(dir, { path, sort: false })) {
		if (found.kind !== 'file') {
			throw new TaskError(`${found.id}: not a regular file or directory`);
		}
		files.push({ path: found.path, content: await dir.read(`${path}/${found.path}`) });
	}
	return files.sort(compare_paths);
};

/** Path-keyed differences between two sorted file lists — `expected` is what git says, `actual` what disk holds. */
export const diff_trees = (
	expected: ReadonlyArray<SnapshotFile>,
	actual: ReadonlyArray<SnapshotFile>
): Array<string> => {
	const problems: Array<string> = [];
	const by_path = new Map(actual.map((f) => [f.path, f.content]));
	for (const file of expected) {
		const on_disk = by_path.get(file.path);
		if (on_disk === undefined) problems.push(`missing on disk: ${file.path}`);
		else if (!bytes_equal(on_disk, file.content)) problems.push(`content differs: ${file.path}`);
		by_path.delete(file.path);
	}
	for (const path of by_path.keys()) problems.push(`not in the pinned tree: ${path}`);
	return problems;
};

const bytes_equal = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.byteLength !== b.byteLength) return false;
	for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
	return true;
};
