import { fs } from '@fuzdev/gro/fs.ts';
import { is_fs_error } from '@fuzdev/gro/fs_error.ts';
import { create_fs_paths } from '@fuzdev/gro/fs_paths.ts';
import { spawn } from '@fuzdev/gro/spawn.ts';
import { assert, describe, test } from 'vitest';

import type { Collection } from '#lib/manifest.ts';
import { resolve_source } from '#lib/source.ts';

import { assert_task_error_includes, commit_files, create_temp_dir, git } from './test_helpers.ts';

const to_collection = (commit: string, url: string): Collection => ({
	name: 'up',
	url,
	commit,
	subpaths: ['.'],
	exclude: [],
	license: { spdx: 'MIT', file: 'LICENSE' },
	shaped_by: 'tsv',
	origin: 'own'
});

describe('resolve_source', () => {
	test('uses a sibling checkout that holds the commit, without touching the cache', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		const sibling = siblings.dir('.');
		await siblings.mkdir('up');
		const commit = await commit_files(sibling.dir('up'), { 'a.ts': 'a' });
		const logged: Array<string> = [];
		const source = await resolve_source(
			{ git, project, fs_paths: create_fs_paths(fs), log: (m) => logged.push(m) },
			to_collection(commit, 'file:///nowhere'),
			{ siblings_path: siblings.path }
		);
		assert.strictEqual(source.path, `${siblings.path}/up`);
		assert.deepEqual(logged, []);
		assert.isFalse(await project.exists('.cache'));
	});

	test('fetches into the cache when no sibling has the commit, once', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using upstream = await create_temp_dir();
		const commit = await commit_files(upstream, { 'a.ts': 'a' });
		const url = `file://${upstream.path}`;
		// a sibling at the same name without the commit
		await siblings.mkdir('up');
		await commit_files(siblings.dir('up'), { 'b.ts': 'b' });
		const logged: Array<string> = [];
		const deps = {
			git,
			project,
			fs_paths: create_fs_paths(fs),
			log: (m: string) => logged.push(m)
		};
		const options = { siblings_path: siblings.path };
		const source = await resolve_source(deps, to_collection(commit, url), options);
		assert.strictEqual(source.path, `${project.path}/.cache/repos/up.git`);
		assert.strictEqual(logged.length, 1);
		const again = await resolve_source(deps, to_collection(commit, url), options);
		assert.strictEqual(again.path, source.path);
		assert.strictEqual(logged.length, 1, 'a cached commit is not fetched again');
	});

	test('a directory with no `.git` is no checkout, and a file is no directory', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using upstream = await create_temp_dir();
		const commit = await commit_files(upstream, { 'a.ts': 'a' });
		const url = `file://${upstream.path}`;
		await siblings.mkdir('up'); // no `.git`
		const deps = { git, project, fs_paths: create_fs_paths(fs), log: () => {} };
		const from_dir = await resolve_source(deps, to_collection(commit, url), {
			siblings_path: siblings.path
		});
		assert.strictEqual(from_dir.path, `${project.path}/.cache/repos/up.git`);

		await using other_siblings = await create_temp_dir();
		await other_siblings.write('up', 'not a directory');
		await using other_project = await create_temp_dir();
		const from_file = await resolve_source(
			{ ...deps, project: other_project },
			to_collection(commit, url),
			{ siblings_path: other_siblings.path }
		);
		assert.strictEqual(from_file.path, `${other_project.path}/.cache/repos/up.git`);
	});

	test('a directory inside another repo is not that repo', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		const commit = await commit_files(siblings, { 'a.ts': 'a' });
		await siblings.mkdir('up'); // git's discovery from here would find `siblings`' repo
		const source = await resolve_source(
			{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
			to_collection(commit, `file://${siblings.path}`),
			{ siblings_path: siblings.path }
		);
		assert.strictEqual(source.path, `${project.path}/.cache/repos/up.git`);
	});

	test('a symlink loop at the sibling path falls through to the cache', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using upstream = await create_temp_dir();
		const commit = await commit_files(upstream, { 'a.ts': 'a' });
		await spawn.program('ln').run(['-s', 'up', 'up'], { cwd: siblings });
		const source = await resolve_source(
			{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
			to_collection(commit, `file://${upstream.path}`),
			{ siblings_path: siblings.path }
		);
		assert.strictEqual(source.path, `${project.path}/.cache/repos/up.git`);
	});

	test('a dangling symlink into the project falls through to the cache', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using upstream = await create_temp_dir();
		const commit = await commit_files(upstream, { 'a.ts': 'a' });
		await spawn
			.program('ln')
			.run(['-s', `${fs.project.path}/no_such_dir`, 'up'], { cwd: siblings });
		const source = await resolve_source(
			{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
			to_collection(commit, `file://${upstream.path}`),
			{ siblings_path: siblings.path }
		);
		assert.strictEqual(source.path, `${project.path}/.cache/repos/up.git`);
	});

	test('an unreadable sibling falls through to the cache', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using upstream = await create_temp_dir();
		const commit = await commit_files(upstream, { 'a.ts': 'a' });
		await siblings.mkdir('up');
		const chmod = spawn.program('chmod');
		await chmod.run(['000', 'up'], { cwd: siblings });
		try {
			const source = await resolve_source(
				{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
				to_collection(commit, `file://${upstream.path}`),
				{ siblings_path: siblings.path }
			);
			assert.strictEqual(source.path, `${project.path}/.cache/repos/up.git`);
		} finally {
			await chmod.run(['755', 'up'], { cwd: siblings });
		}
	});

	test('a `.git` symlink out of the checkout is still a checkout', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using elsewhere = await create_temp_dir();
		const commit = await commit_files(elsewhere, { 'a.ts': 'a' });
		await siblings.mkdir('up');
		await spawn
			.program('ln')
			.run(['-s', `${elsewhere.path}/.git`, '.git'], { cwd: siblings.dir('up') });
		const source = await resolve_source(
			{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
			to_collection(commit, 'file:///nowhere'),
			{ siblings_path: siblings.path }
		);
		assert.strictEqual(source.path, `${siblings.path}/up`);
	});

	test('refuses a `.cache` symlinked out of the project', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using outside = await create_temp_dir();
		await spawn.program('ln').run(['-s', outside.path, '.cache'], { cwd: project });
		try {
			await resolve_source(
				{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
				to_collection('f'.repeat(40), 'file:///nowhere'),
				{ siblings_path: siblings.path }
			);
		} catch (error) {
			assert(is_fs_error(error, 'outside_root'), String(error));
			return;
		}
		assert.fail('expected the handle to refuse the symlink');
	});

	test('follows a symlinked sibling to its checkout', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using real = await create_temp_dir();
		const commit = await commit_files(real, { 'a.ts': 'a' });
		await spawn.program('ln').run(['-s', real.path, 'up'], { cwd: siblings });
		const source = await resolve_source(
			{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
			to_collection(commit, 'file:///nowhere'),
			{ siblings_path: siblings.path }
		);
		assert.strictEqual(source.path, real.path);
	});

	test('fails when the upstream cannot be fetched', async () => {
		await using project = await create_temp_dir();
		await using siblings = await create_temp_dir();
		await using upstream = await create_temp_dir();
		await commit_files(upstream, { 'a.ts': 'a' });
		const absent = 'f'.repeat(40);
		await assert_task_error_includes(
			resolve_source(
				{ git, project, fs_paths: create_fs_paths(fs), log: () => {} },
				to_collection(absent, `file://${upstream.path}`),
				{ siblings_path: siblings.path }
			),
			'git fetch'
		);
	});
});
