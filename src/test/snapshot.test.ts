import { spawn } from '@fuzdev/gro/spawn.ts';
import { assert, describe, test } from 'vitest';

import type { Collection } from '#lib/manifest.ts';
import {
	LARGE_FILE_BYTES,
	diff_trees,
	license_content,
	lock_entry,
	materialize_collection,
	read_tree,
	write_collection,
	type SnapshotFile
} from '#lib/snapshot.ts';

import {
	assert_task_error_includes,
	commit_files,
	commit_raw_paths,
	commit_symlink,
	create_temp_dir,
	git
} from './test_helpers.ts';

const MIT = 'Permission is hereby granted, free of charge, to any person';
const INCLUDE: ReadonlySet<string> = new Set(['ts', 'css']);
const encode = (s: string): Uint8Array => new TextEncoder().encode(s);
const to_paths = (files: ReadonlyArray<SnapshotFile>): Array<string> => files.map((f) => f.path);

const to_collection = (commit: string, overrides: Partial<Collection> = {}): Collection => ({
	name: 'x',
	url: 'https://github.com/fuzdev/x',
	commit,
	subpaths: ['src'],
	exclude: [],
	license: { spdx: 'MIT', file: 'LICENSE' },
	shaped_by: 'tsv',
	origin: 'own',
	...overrides
});

describe('materialize_collection', () => {
	test('keeps included files in code-unit order and adds the LICENSE', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, {
			LICENSE: MIT,
			'src/a.ts': 'a',
			'src/B.ts': 'b',
			'src/skip.json': '{}',
			'src/fixtures/gone.ts': 'gone',
			'other/out.ts': 'out'
		});
		const { files } = await materialize_collection(
			git,
			to_collection(commit, { exclude: ['src/fixtures'] }),
			INCLUDE,
			dir
		);
		assert.deepEqual(to_paths(files), ['LICENSE', 'src/B.ts', 'src/a.ts']);
		const license = files[0]!;
		assert.strictEqual(new TextDecoder().decode(license.content), MIT);
	});

	test('skips a symlink, reporting it', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a' });
		const commit = await commit_symlink(dir, 'src/link.ts', 'a.ts');
		const { files, symlinks } = await materialize_collection(
			git,
			to_collection(commit),
			INCLUDE,
			dir
		);
		assert.deepEqual(symlinks, ['src/link.ts']);
		assert.notInclude(to_paths(files), 'src/link.ts');
	});

	test('reports a file at the large threshold, not one below it', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, {
			LICENSE: MIT,
			'src/large.ts': 'x'.repeat(LARGE_FILE_BYTES),
			'src/small.ts': 'x'.repeat(LARGE_FILE_BYTES - 1)
		});
		const { large } = await materialize_collection(git, to_collection(commit), INCLUDE, dir);
		assert.deepEqual(large, ['src/large.ts']);
	});

	test('keeps a named file whatever its extension', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, {
			LICENSE: MIT,
			'package.json': '{"type":"module"}',
			'src/a.ts': 'a'
		});
		const { files } = await materialize_collection(
			git,
			to_collection(commit, { files: ['package.json'] }),
			INCLUDE,
			dir
		);
		assert.deepEqual(to_paths(files), ['LICENSE', 'package.json', 'src/a.ts']);
	});

	test('refuses a named file that is missing or a symlink', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a', 'real.ts': 'r' });
		const commit = await commit_symlink(dir, 'link.ts', 'real.ts');
		await assert_task_error_includes(
			materialize_collection(git, to_collection(commit, { files: ['nope.txt'] }), INCLUDE, dir),
			'nope.txt'
		);
		await assert_task_error_includes(
			materialize_collection(git, to_collection(commit, { files: ['link.ts'] }), INCLUDE, dir),
			'link.ts'
		);
	});

	const raw_path = (prefix: string, byte: number, suffix: string): Uint8Array => {
		const encoder = new TextEncoder();
		return new Uint8Array([...encoder.encode(prefix), byte, ...encoder.encode(suffix)]);
	};

	test('drops a path that is not UTF-8 under an exclude', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a' });
		const commit = await commit_raw_paths(dir, [raw_path('src/fixtures/', 0xff, '.ts')]);
		const { files } = await materialize_collection(
			git,
			to_collection(commit, { exclude: ['src/fixtures'] }),
			INCLUDE,
			dir
		);
		assert.deepEqual(to_paths(files), ['LICENSE', 'src/a.ts']);
	});

	test('drops a path that is not UTF-8 with an extension not included', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a' });
		const commit = await commit_raw_paths(dir, [raw_path('src/', 0xff, '.json')]);
		const { files } = await materialize_collection(git, to_collection(commit), INCLUDE, dir);
		assert.deepEqual(to_paths(files), ['LICENSE', 'src/a.ts']);
	});

	test('refuses a kept path that is not UTF-8, naming the collection and the path', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a' });
		const commit = await commit_raw_paths(dir, [raw_path('src/', 0xff, '.ts')]);
		const promise = materialize_collection(git, to_collection(commit), INCLUDE, dir);
		await assert_task_error_includes(promise, 'x: kept path "src/\uFFFD.ts"');
	});

	test('skips a symlink whose name is not UTF-8, as it skips any symlink', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a' });
		const commit = await commit_raw_paths(dir, [raw_path('src/', 0xff, '.ts')], '120000');
		const { files, symlinks } = await materialize_collection(
			git,
			to_collection(commit),
			INCLUDE,
			dir
		);
		assert.deepEqual(to_paths(files), ['LICENSE', 'src/a.ts']);
		assert.deepEqual(symlinks, ['src/\uFFFD.ts']);
	});

	test('refuses two kept names only their invalid bytes tell apart', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { LICENSE: MIT, 'src/a.ts': 'a' });
		const commit = await commit_raw_paths(dir, [
			raw_path('src/', 0xff, '.ts'),
			raw_path('src/', 0xfe, '.ts')
		]);
		await assert_task_error_includes(
			materialize_collection(git, to_collection(commit), INCLUDE, dir),
			"isn't UTF-8"
		);
	});

	test('refuses a subpath that matches nothing', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { LICENSE: MIT, 'src/a.json': '{}' });
		await assert_task_error_includes(
			materialize_collection(git, to_collection(commit), INCLUDE, dir),
			'matched no files'
		);
	});
});

describe('license_content', () => {
	test('returns the license file verbatim when it reads as the id', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { LICENSE: MIT + '\n' });
		const bytes = await license_content(git, to_collection(commit), dir);
		assert.strictEqual(new TextDecoder().decode(bytes), MIT + '\n');
	});

	test('refuses a license file not reading as the id', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { LICENSE: 'all rights reserved' });
		await assert_task_error_includes(
			license_content(git, to_collection(commit), dir),
			'does not read as MIT'
		);
	});

	test('refuses a license id that is not permissive', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { LICENSE: MIT });
		await assert_task_error_includes(
			license_content(
				git,
				to_collection(commit, { license: { spdx: 'BUSL-1.1', file: 'LICENSE' } }),
				dir
			),
			'not permissive'
		);
	});

	test('generates a note for a matching declared license', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'package.json': '{"license":"MIT"}' });
		const bytes = await license_content(
			git,
			to_collection(commit, { license: { spdx: 'MIT', declared_in: 'package.json' } }),
			dir
		);
		const text = new TextDecoder().decode(bytes);
		assert.include(text, `at commit ${commit}`);
		assert.isTrue(text.startsWith('MIT (declared, not shipped as a file)\n\n'));
	});

	test('refuses a declaration file that is not JSON', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'package.json': 'not json' });
		await assert_task_error_includes(
			license_content(
				git,
				to_collection(commit, { license: { spdx: 'MIT', declared_in: 'package.json' } }),
				dir
			),
			'x: package.json is not valid JSON'
		);
	});

	test('refuses a declaration that disagrees with the manifest', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'package.json': '{"license":"ISC"}' });
		await assert_task_error_includes(
			license_content(
				git,
				to_collection(commit, { license: { spdx: 'MIT', declared_in: 'package.json' } }),
				dir
			),
			'declares license "ISC"'
		);
	});
});

describe('lock_entry', () => {
	// the digests are sha256sum's, independent of the code under test
	test('digests paths and contents in file order', async () => {
		const entry = await lock_entry('c'.repeat(40), [
			{ path: 'a/one.ts', content: encode('alpha\n') },
			{ path: 'b.ts', content: new Uint8Array([0, 1, 2, 255, 10, 13]) }
		]);
		assert.deepEqual(entry, {
			commit: 'c'.repeat(40),
			files: 2,
			bytes: 12,
			digest: 'sha256:6ca750c00f345e671ca488352f776568580f3c796002d3e10134068c73178cc2'
		});
		assert.deepEqual(Object.keys(entry), ['commit', 'files', 'bytes', 'digest']);
	});
});

describe('read_tree', () => {
	test('reads nested files with exact bytes, in code-unit order', async () => {
		await using dir = await create_temp_dir();
		await dir.mkdir('c/sub', { recursive: true });
		await dir.write('c/sub/z.ts', new Uint8Array([0, 200]));
		await dir.write('c/B.ts', 'b');
		await dir.write('c/a.ts', 'a');
		const files = await read_tree(dir, 'c');
		assert.deepEqual(to_paths(files), ['B.ts', 'a.ts', 'sub/z.ts']);
		assert.deepEqual(files[2]!.content, new Uint8Array([0, 200]));
	});

	test('reads nothing where nothing is', async () => {
		await using dir = await create_temp_dir();
		assert.deepEqual(await read_tree(dir, 'missing'), []);
	});

	test('refuses a symlink', async () => {
		await using dir = await create_temp_dir();
		await dir.mkdir('c');
		await dir.write('c/a.ts', 'a');
		await spawn.program('ln').run(['-s', 'a.ts', 'link.ts'], { cwd: dir.dir('c') });
		await assert_task_error_includes(read_tree(dir, 'c'), 'not a regular file or directory');
	});
});

describe('write_collection', () => {
	test('replaces what was there and writes nested paths', async () => {
		await using dir = await create_temp_dir();
		await dir.mkdir('x');
		await dir.write('x/stale.ts', 'stale');
		await write_collection(dir, to_collection('c'.repeat(40)), {
			files: [
				{ path: 'LICENSE', content: encode('l') },
				{ path: 'a/b/c.ts', content: new Uint8Array([1, 2]) },
				{ path: 'a/d.ts', content: encode('d') }
			],
			symlinks: [],
			large: []
		});
		assert.isFalse(await dir.exists('x/stale.ts'));
		assert.deepEqual(await dir.read('x/a/b/c.ts'), new Uint8Array([1, 2]));
		assert.strictEqual(await dir.read_text('x/LICENSE'), 'l');
	});
});

describe('diff_trees', () => {
	const f = (path: string, content: string): SnapshotFile => ({ path, content: encode(content) });

	test('reports nothing for matching trees', () => {
		assert.deepEqual(diff_trees([f('a', '1')], [f('a', '1')]), []);
	});

	test('names a missing, differing, and extra file', () => {
		assert.deepEqual(diff_trees([f('a', '1'), f('b', '1')], [f('b', '2'), f('c', '1')]), [
			'missing on disk: a',
			'content differs: b',
			'not in the pinned tree: c'
		]);
	});

	test('a file that is a prefix of the blob differs', () => {
		assert.deepEqual(diff_trees([f('a', 'abcd')], [f('a', 'ab')]), ['content differs: a']);
	});

	test('equal-length different bytes differ', () => {
		assert.deepEqual(diff_trees([f('a', 'xy')], [f('a', 'xz')]), ['content differs: a']);
	});
});
