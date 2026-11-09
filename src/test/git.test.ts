import type { SpawnOutputBytes, SpawnProgram } from '@fuzdev/gro/spawn.ts';
import { assert, describe, test } from 'vitest';

import { git_cat_blobs, git_has_commit, git_ls_tree, git_out_bytes } from '#lib/git.ts';

import {
	assert_task_error_includes,
	commit_files,
	commit_gitlink,
	commit_raw_paths,
	commit_symlink,
	create_temp_dir,
	git
} from './test_helpers.ts';

const NO_BYTES = new Uint8Array(0);

const fake_git = (result: Partial<SpawnOutputBytes>): SpawnProgram =>
	({
		out_bytes: async () => ({
			kind: 'exited',
			code: 0,
			stdout: NO_BYTES,
			stderr: NO_BYTES,
			truncated: false,
			...result
		})
	}) as unknown as SpawnProgram;

describe('git_out_bytes', () => {
	test('returns stdout bytes', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'a.txt': 'hello' });
		const out = await git_out_bytes(git, dir, ['rev-parse', 'HEAD']);
		assert.strictEqual(new TextDecoder().decode(out).trim(), commit);
	});

	test('throws naming the command, directory, and stderr on a non-zero exit', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { 'a.txt': 'x' });
		await assert_task_error_includes(
			git_out_bytes(git, dir, ['rev-parse', 'nosuchref']),
			'git rev-parse nosuchref'
		);
		await assert_task_error_includes(git_out_bytes(git, dir, ['rev-parse', 'nosuchref']), dir.path);
		await assert_task_error_includes(
			git_out_bytes(git, dir, ['rev-parse', 'nosuchref']),
			'nosuchref'
		);
	});

	test('a truncated capture fails even on exit 0', async () => {
		await using dir = await create_temp_dir();
		await assert_task_error_includes(
			git_out_bytes(fake_git({ truncated: true, stdout: new Uint8Array([1]) }), dir, ['x']),
			'cut off'
		);
	});

	test('a child ended by a signal fails', async () => {
		await using dir = await create_temp_dir();
		await assert_task_error_includes(
			git_out_bytes(
				fake_git({ kind: 'signaled', code: null, signal: 'SIGKILL' } as Partial<SpawnOutputBytes>),
				dir,
				['x']
			),
			'signaled'
		);
	});

	test('sends stdin data', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'a.txt': 'x' });
		const out = await git_out_bytes(
			git,
			dir,
			['cat-file', '--batch-check'],
			new TextEncoder().encode(commit + '\n')
		);
		assert.include(new TextDecoder().decode(out), `${commit} commit`);
	});
});

describe('git_has_commit', () => {
	test('names a commit, not any object', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'a.txt': 'x' });
		assert.isTrue(await git_has_commit(git, dir, commit));
		assert.isFalse(await git_has_commit(git, dir, 'f'.repeat(40)));
		const blob = new TextDecoder()
			.decode(await git_out_bytes(git, dir, ['rev-parse', 'HEAD:a.txt']))
			.trim();
		assert.isFalse(await git_has_commit(git, dir, blob));
	});
});

describe('git_ls_tree', () => {
	test('lists blobs and symlinks with paths verbatim and sizes as numbers', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { 'src/a b.ts': 'abc', 'src/é.ts': 'de' });
		const commit = await commit_symlink(dir, 'src/link.ts', 'a b.ts');
		const entries = await git_ls_tree(git, dir, commit, 'src');
		assert.deepEqual(
			entries.map((e) => e.path),
			['src/a b.ts', 'src/link.ts', 'src/é.ts']
		);
		assert.strictEqual(entries[0]!.size, 3);
		assert.strictEqual(entries[0]!.mode, '100644');
		assert.strictEqual(entries[1]!.mode, '120000');
	});

	test('flags a path that is not UTF-8, naming it lossily', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { 'ok.ts': 'ok' });
		const commit = await commit_raw_paths(dir, [new Uint8Array([97, 47, 0xff, 46, 116, 115])]);
		const entries = await git_ls_tree(git, dir, commit, '.');
		assert.deepEqual(
			entries.map((e) => [e.path, e.path_is_utf8]),
			[
				['a/\uFFFD.ts', false],
				['ok.ts', true]
			]
		);
	});

	test('keeps a tab in a path', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { 'a\tb.ts': 'a' });
		const entries = await git_ls_tree(git, dir, commit, '.');
		assert.deepEqual(
			entries.map((e) => e.path),
			['a\tb.ts']
		);
	});

	test('keeps a byte order mark in a path', async () => {
		await using dir = await create_temp_dir();
		const commit = await commit_files(dir, { '\uFEFFa.ts': 'a' });
		const entries = await git_ls_tree(git, dir, commit, '.');
		assert.deepEqual(
			entries.map((e) => e.path),
			['\uFEFFa.ts']
		);
		assert.isTrue(entries[0]!.path_is_utf8);
	});

	test('leaves out a submodule entry', async () => {
		await using dir = await create_temp_dir();
		const first = await commit_files(dir, { 'a.ts': 'a' });
		const commit = await commit_gitlink(dir, 'sub', first);
		const entries = await git_ls_tree(git, dir, commit, '.');
		assert.deepEqual(
			entries.map((e) => e.path),
			['a.ts']
		);
	});
});

describe('git_cat_blobs', () => {
	test('round-trips binary content', async () => {
		await using dir = await create_temp_dir();
		const bytes = new Uint8Array([0, 10, 13, 255, 10]);
		const commit = await commit_files(dir, { 'b.bin': bytes, 'a.txt': 'text\n' });
		const entries = await git_ls_tree(git, dir, commit, '.');
		const blobs = await git_cat_blobs(
			git,
			dir,
			entries.map((e) => e.oid)
		);
		const blob = entries.find((e) => e.path === 'b.bin')!;
		assert.deepEqual(blobs.get(blob.oid), bytes);
		assert.strictEqual(blobs.size, 2);
	});

	test('reads output past a pipe buffer without deadlocking', async () => {
		await using dir = await create_temp_dir();
		const files: Record<string, string> = {};
		for (let i = 0; i < 40; i++) files[`f${i}.txt`] = `${i}\n`.repeat(20_000);
		const commit = await commit_files(dir, files);
		const oids = (await git_ls_tree(git, dir, commit, '.')).map((e) => e.oid);
		const blobs = await git_cat_blobs(git, dir, oids);
		assert.strictEqual(blobs.size, 40);
	}, 30_000);

	test('throws on a missing object', async () => {
		await using dir = await create_temp_dir();
		await commit_files(dir, { 'a.txt': 'x' });
		await assert_task_error_includes(git_cat_blobs(git, dir, ['0'.repeat(40)]), 'is missing');
	});

	test('runs nothing for no oids', async () => {
		await using dir = await create_temp_dir();
		const blobs = await git_cat_blobs(
			{
				out_bytes: () => {
					throw Error('must not run');
				}
			} as unknown as SpawnProgram,
			dir,
			[]
		);
		assert.strictEqual(blobs.size, 0);
	});
});
