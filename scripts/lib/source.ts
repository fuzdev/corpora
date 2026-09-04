/**
 * Finds a git directory that holds a collection's pinned commit: a sibling checkout
 * under the workspace (`../<name>`) when one has the commit, else a bare clone in the
 * gitignored `.cache/repos/`, fetched shallowly at exactly that commit. Either way the
 * bytes come from git objects, never from a working tree.
 *
 * @module
 */

import { join } from 'node:path';

import { git, has_commit } from './git.ts';
import type { Collection } from './manifest.ts';

export interface SourceOptions {
	/** The directory sibling checkouts live in — the repo's parent. */
	siblings_dir: string;
	/** Where bare clones are cached. */
	cache_dir: string;
	log: (message: string) => void;
}

const exists = async (path: string): Promise<boolean> => {
	try {
		await Deno.stat(path);
		return true;
	} catch {
		return false;
	}
};

/** Resolves a git directory containing `collection.commit`, fetching into the cache if needed. */
export const resolve_source = async (
	collection: Collection,
	options: SourceOptions
): Promise<string> => {
	const { name, url, commit } = collection;
	const sibling = join(options.siblings_dir, name);
	if ((await exists(join(sibling, '.git'))) && (await has_commit(sibling, commit))) {
		return sibling;
	}
	const cache = join(options.cache_dir, `${name}.git`);
	if (!(await exists(cache))) {
		await Deno.mkdir(cache, { recursive: true });
		await git(['init', '--bare', '-q'], cache);
	}
	if (!(await has_commit(cache, commit))) {
		options.log(`  fetching ${name}@${commit.slice(0, 9)} from ${url}`);
		await git(['fetch', '--depth', '1', '-q', url, commit], cache);
		if (!(await has_commit(cache, commit))) {
			throw new Error(`${name}: ${url} did not serve commit ${commit}`);
		}
	}
	return cache;
};
