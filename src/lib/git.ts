/**
 * Thin git helpers: every subprocess the materializer runs. Output is bytes, because
 * blob content is copied verbatim.
 *
 * @module
 */

import type { FsReadDir } from '@fuzdev/gro/fs.ts';
import type { SpawnProgram } from '@fuzdev/gro/spawn.ts';
import { TaskError } from '@fuzdev/gro/task.ts';

const decoder = new TextDecoder();
// `ignoreBOM` keeps a leading U+FEFF, which is part of a path's name
const path_decoder = new TextDecoder('utf-8', { ignoreBOM: true });
const fatal_path_decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

/**
 * Runs `git` with `args` in `cwd` and returns its stdout.
 * @param stdin - data sent to the child's stdin
 * @throws TaskError - on anything but a clean exit with its whole output, naming stderr
 */
export const git_out_bytes = async (
	git: SpawnProgram,
	cwd: FsReadDir,
	args: ReadonlyArray<string>,
	stdin?: Uint8Array
): Promise<Uint8Array> => {
	const result = await git.out_bytes(args, stdin === undefined ? { cwd } : { cwd, stdin });
	const command = `git ${args.join(' ')} (in ${cwd.path})`;
	// never data, even on exit 0: the capture hit its limit, or a pipe stayed open past the child's
	// exit, so the message names both
	if (result.truncated) {
		throw new TaskError(
			`${command}: output was cut off, past the capture limit or by a pipe left open`
		);
	}
	if (result.kind !== 'exited' || result.code !== 0) {
		const ended = result.kind === 'exited' ? `exit code ${result.code}` : result.kind;
		throw new TaskError(`${command} failed (${ended}):\n${decoder.decode(result.stderr).trim()}`);
	}
	return result.stdout;
};

/** Whether the repo at `cwd` has `commit` as a commit object. */
export const git_has_commit = async (
	git: SpawnProgram,
	cwd: FsReadDir,
	commit: string
): Promise<boolean> => {
	const child = await git.start(['cat-file', '-e', `${commit}^{commit}`], {
		cwd,
		stdio: 'ignore'
	});
	const result = await child.closed;
	return result.kind === 'exited' && result.code === 0;
};

/** One `git ls-tree -r -l` row. */
export interface GitTreeEntry {
	/** `100644`, `100755` (blobs), `120000` (symlink) or `160000` (submodule). */
	mode: string;
	oid: string;
	size: number;
	/** Repo-relative path, lossy (U+FFFD for the bad bytes) when `path_is_utf8` is `false`. */
	path: string;
	path_is_utf8: boolean;
}

/**
 * Recursively lists the tree at `commit` under `subpath`, blobs and symlinks alike.
 * A path that isn't UTF-8 is listed lossily, flagged, so a caller can drop it unread
 * or refuse it.
 */
export const git_ls_tree = async (
	git: SpawnProgram,
	cwd: FsReadDir,
	commit: string,
	subpath: string
): Promise<Array<GitTreeEntry>> => {
	const out = await git_out_bytes(git, cwd, ['ls-tree', '-r', '-l', '-z', commit, '--', subpath]);
	const entries: Array<GitTreeEntry> = [];
	let start = 0;
	while (start < out.length) {
		const nul = out.indexOf(0, start);
		const end = nul === -1 ? out.length : nul;
		const row = out.subarray(start, end);
		start = end + 1;
		const tab = row.indexOf(9);
		const [mode, type, oid, size] = decoder.decode(row.subarray(0, tab)).split(/\s+/);
		if (type !== 'blob') continue; // submodules (`commit`) carry no bytes here
		const path_bytes = row.subarray(tab + 1);
		let path: string;
		let path_is_utf8 = true;
		try {
			path = fatal_path_decoder.decode(path_bytes);
		} catch {
			path = path_decoder.decode(path_bytes);
			path_is_utf8 = false;
		}
		entries.push({ mode: mode!, oid: oid!, size: Number(size), path, path_is_utf8 });
	}
	return entries;
};

/**
 * Reads many blobs in one `git cat-file --batch` round trip, keyed by oid.
 * @throws TaskError - when git reports an object missing
 */
export const git_cat_blobs = async (
	git: SpawnProgram,
	cwd: FsReadDir,
	oids: ReadonlyArray<string>
): Promise<Map<string, Uint8Array>> => {
	const blobs: Map<string, Uint8Array> = new Map();
	if (oids.length === 0) return blobs;
	const stdout = await git_out_bytes(
		git,
		cwd,
		['cat-file', '--batch'],
		encoder.encode(oids.join('\n') + '\n')
	);
	let i = 0;
	while (i < stdout.length) {
		const nl = stdout.indexOf(10, i);
		if (nl === -1) throw new TaskError('git cat-file --batch: truncated header');
		const [oid, type, size_str] = decoder.decode(stdout.subarray(i, nl)).split(' ');
		if (type === 'missing' || type === undefined) {
			throw new TaskError(`git cat-file --batch: object ${oid} is ${type ?? 'unreadable'}`);
		}
		const size = Number(size_str);
		const start = nl + 1;
		blobs.set(oid!, stdout.slice(start, start + size));
		i = start + size + 1; // the trailing newline after the content
	}
	return blobs;
};
