import { assert, describe, test } from 'vitest';

import { git } from './test_helpers.ts';

/** Whether git ignores `path` in this checkout; `check-ignore` exits 1 for no. */
const is_ignored = async (path: string): Promise<boolean> => {
	const result = await git.out(['check-ignore', '-q', '--', path]);
	assert(result.kind === 'exited' && result.code !== 128, result.stderr);
	return result.code === 0;
};

describe('.gitignore', () => {
	test('hides nothing under collections/', async () => {
		for (const path of [
			'collections/x/a.local',
			'collections/x/a.local.ts',
			'collections/x/.cache/a.ts',
			'collections/x/node_modules/a.ts',
			'collections/x/.gro/a.ts'
		]) {
			assert.isFalse(await is_ignored(path), path);
		}
	});

	test('still ignores the root locals and cache', async () => {
		for (const path of [
			'a.local',
			'a.local.ts',
			'.cache/repos/a.git',
			'node_modules/a',
			'.gro/a'
		]) {
			assert.isTrue(await is_ignored(path), path);
		}
	});
});
