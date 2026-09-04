/**
 * Materializing one collection from git objects, and the on-disk questions the check
 * asks of the result: walking a tree, digesting it, comparing two trees.
 *
 * @module
 */

import { dirname, join, relative } from 'node:path';

import { cat_blobs, git, ls_tree } from './git.ts';
import { PERMISSIVE_LICENSES, is_included_path, type Collection } from './manifest.ts';

/** A file the snapshot holds, with its content. */
export interface SnapshotFile {
	/** Path relative to the collection root — the upstream repo-relative path. */
	path: string;
	content: Uint8Array;
}

/** What materializing one collection produced. */
export interface MaterializedCollection {
	files: SnapshotFile[];
	/** Symlinks the filter would have kept, skipped: a snapshot holds bytes, not links. */
	symlinks: string[];
	/** Files over `LARGE_FILE_BYTES`, reported so a stray bundle is noticed. */
	large: string[];
}

/** Files at or above this size are listed in the summary. */
export const LARGE_FILE_BYTES = 512 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Builds a collection's files from the pinned commit in `source`: the filtered tree
 * under each subpath plus the LICENSE. Nothing is written here.
 */
export const materialize_collection = async (
	collection: Collection,
	include: ReadonlySet<string>,
	source: string
): Promise<MaterializedCollection> => {
	const symlinks: string[] = [];
	const large: string[] = [];
	const kept: Array<{ path: string; oid: string }> = [];
	for (const subpath of collection.subpaths) {
		for (const entry of await ls_tree(source, collection.commit, subpath)) {
			if (!is_included_path(entry.path, include, collection.exclude)) continue;
			if (entry.mode === '120000') {
				symlinks.push(entry.path);
				continue;
			}
			if (entry.path === 'LICENSE') {
				throw new Error(
					`${collection.name}: upstream file "LICENSE" collides with the collection LICENSE`
				);
			}
			if (entry.size >= LARGE_FILE_BYTES) large.push(entry.path);
			kept.push({ path: entry.path, oid: entry.oid });
		}
	}
	if (kept.length === 0) {
		throw new Error(`${collection.name}: no files matched — did the upstream layout change?`);
	}
	kept.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const blobs = await cat_blobs(source, [...new Set(kept.map((k) => k.oid))]);
	const files: SnapshotFile[] = kept.map((k) => ({ path: k.path, content: blobs.get(k.oid)! }));
	files.push({ path: 'LICENSE', content: await license_content(collection, source) });
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { files, symlinks, large };
};

/**
 * The bytes of `collections/<name>/LICENSE`: the upstream's license file verbatim, or,
 * for a `declared_in` license, a generated note that names the declaration. Both are
 * verified against the manifest's SPDX id — a wrong or missing license fails here.
 */
export const license_content = async (
	collection: Collection,
	source: string
): Promise<Uint8Array> => {
	const { license, commit, name, url } = collection;
	const marker = PERMISSIVE_LICENSES[license.spdx];
	if (!marker) throw new Error(`${name}: license ${license.spdx} is not permissive`);
	if ('file' in license) {
		const bytes = await git(['cat-file', 'blob', `${commit}:${license.file}`], source);
		if (!marker.test(decoder.decode(bytes))) {
			throw new Error(`${name}: ${license.file} does not read as ${license.spdx}`);
		}
		return bytes;
	}
	const pkg_text = decoder.decode(
		await git(['cat-file', 'blob', `${commit}:${license.declared_in}`], source)
	);
	const declared = (JSON.parse(pkg_text) as { license?: unknown }).license;
	if (declared !== license.spdx) {
		throw new Error(
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

/** Writes a materialized collection under `root/<name>`, replacing whatever was there. */
export const write_collection = async (
	root: string,
	collection: Collection,
	materialized: MaterializedCollection
): Promise<void> => {
	const dir = join(root, collection.name);
	await Deno.remove(dir, { recursive: true }).catch(() => {});
	const made = new Set<string>();
	for (const file of materialized.files) {
		const target = join(dir, file.path);
		const parent = dirname(target);
		if (!made.has(parent)) {
			await Deno.mkdir(parent, { recursive: true });
			made.add(parent);
		}
		await Deno.writeFile(target, file.content);
	}
};

/** Hex SHA-256 of `bytes`. */
export const sha256_hex = async (bytes: Uint8Array): Promise<string> => {
	const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** What the lock records per collection. */
export interface LockEntry {
	commit: string;
	files: number;
	bytes: number;
	/** `sha256:` over every file's path and content digest, in path order. */
	digest: string;
}

/** Computes a collection's lock entry from its files (sorted by path). */
export const lock_entry = async (
	commit: string,
	files: readonly SnapshotFile[]
): Promise<LockEntry> => {
	let bytes = 0;
	let manifest_text = '';
	for (const file of files) {
		bytes += file.content.byteLength;
		manifest_text += `${file.path}\0${await sha256_hex(file.content)}\n`;
	}
	return {
		commit,
		files: files.length,
		bytes,
		digest: `sha256:${await sha256_hex(encoder.encode(manifest_text))}`
	};
};

/** Every regular file under `dir`, as `SnapshotFile`s sorted by relative path. */
export const read_tree = async (dir: string): Promise<SnapshotFile[]> => {
	const files: SnapshotFile[] = [];
	const walk = async (d: string): Promise<void> => {
		for await (const entry of Deno.readDir(d)) {
			const p = join(d, entry.name);
			if (entry.isDirectory) await walk(p);
			else if (entry.isFile)
				files.push({ path: relative(dir, p), content: await Deno.readFile(p) });
			else throw new Error(`${p}: not a regular file or directory`);
		}
	};
	try {
		await walk(dir);
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return files;
};

/** Path-keyed differences between two sorted file lists — `expected` is what git says, `actual` what disk holds. */
export const diff_trees = (
	expected: readonly SnapshotFile[],
	actual: readonly SnapshotFile[]
): string[] => {
	const problems: string[] = [];
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
