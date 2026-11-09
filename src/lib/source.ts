/**
 * Finds a git directory that holds a collection's pinned commit: a sibling checkout
 * under the workspace (`../<name>`) when one has the commit, else a bare clone in the
 * gitignored `.cache/repos/`, fetched shallowly at exactly that commit. Either way the
 * bytes come from git objects, never from a working tree.
 *
 * @module
 */

import type { FsDir, FsReadDir } from '@fuzdev/gro/fs.ts';
import { is_fs_error, type FsErrorKind } from '@fuzdev/gro/fs_error.ts';
import type { FsPaths } from '@fuzdev/gro/fs_paths.ts';
import type { SpawnProgram } from '@fuzdev/gro/spawn.ts';
import { TaskError } from '@fuzdev/gro/task.ts';

import { git_has_commit, git_out_bytes } from './git.ts';
import type { Collection } from './manifest.ts';

/** Where a collection's bare clone lives, beneath the project. */
export const CACHE_PATH = '.cache/repos';

export interface ResolveSourceDeps {
	git: SpawnProgram;
	/** Holds the cache. Its handle confines the cache to the project. */
	project: FsDir;
	/** Opens the sibling checkouts, which sit outside the project and may be symlinks. */
	fs_paths: Pick<FsPaths, 'open_dir_path'>;
	log: (message: string) => void;
}

export interface ResolveSourceOptions {
	/** The directory sibling checkouts live in, relative to the project or absolute. */
	siblings_path: string;
}

/** The kinds of failure that mean a sibling can't be read, so the cache serves the commit. */
const SIBLING_MISS_KINDS: ReadonlyArray<FsErrorKind> = [
	'not_a_directory',
	'not_found', // a dangling symlink into the project
	'permission_denied',
	'io_error' // a symlink loop or a failed read; either way the cache serves the pinned commit
];

/**
 * Opens `<siblings_path>/<name>` if it is a checkout: a directory holding a `.git` entry.
 * @returns the directory, or `null` for anything else at that path, unreadable ones included
 */
const open_sibling = async (
	fs_paths: ResolveSourceDeps['fs_paths'],
	path: string
): Promise<FsReadDir | null> => {
	try {
		const opened = await fs_paths.open_dir_path(path);
		if (opened === null) return null;
		const dir = opened.path === '' ? opened.dir : opened.dir.dir(opened.path);
		// not followed: a `.git` symlink leading out of the checkout is still a checkout's
		return (await dir.stat('.git', { follow: false })) === null ? null : dir;
	} catch (error) {
		if (is_fs_error(error) && SIBLING_MISS_KINDS.includes(error.kind)) return null;
		throw error;
	}
};

/**
 * Resolves a git directory containing `collection.commit`, fetching into the cache if needed.
 * @throws TaskError - when git fails or the upstream doesn't serve the commit
 */
export const resolve_source = async (
	{ git, project, fs_paths, log }: ResolveSourceDeps,
	collection: Collection,
	{ siblings_path }: ResolveSourceOptions
): Promise<FsReadDir> => {
	const { name, url, commit } = collection;
	const sibling = await open_sibling(fs_paths, `${siblings_path}/${name}`);
	if (sibling !== null && (await git_has_commit(git, sibling, commit))) return sibling;

	const cache_path = `${CACHE_PATH}/${name}.git`;
	await project.mkdir(cache_path, { recursive: true, exists_ok: true });
	const cache = project.dir(cache_path);
	// idempotent, and first: until it's a repo, git's discovery in it finds this repo's own `.git`
	await git_out_bytes(git, cache, ['init', '--bare', '-q']);
	if (!(await git_has_commit(git, cache, commit))) {
		log(`  fetching ${name}@${commit.slice(0, 9)} from ${url}`);
		await git_out_bytes(git, cache, ['fetch', '--depth', '1', '-q', url, commit]);
		if (!(await git_has_commit(git, cache, commit))) {
			throw new TaskError(`${name}: ${url} did not serve commit ${commit}`);
		}
	}
	return cache;
};
