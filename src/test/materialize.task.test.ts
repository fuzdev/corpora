import { args_parse } from '@fuzdev/fuz_util/args.ts';
import { fs, type FsDir } from '@fuzdev/gro/fs.ts';
import { spawn, type SpawnOutput } from '@fuzdev/gro/spawn.ts';
import { assert, describe, test } from 'vitest';

import { Args } from '#lib/materialize.task.ts';
import { MANIFEST_VERSION } from '#lib/manifest.ts';

import { commit_files, create_temp_dir } from './test_helpers.ts';

const TASK_PATH = `${fs.project.path}/src/lib/materialize.task.ts`;
const gro = spawn.program('node_modules/.bin/gro');

/** Runs the task through the CLI, as `npm run` does, in `corpora`. */
const run_task = (corpora: FsDir, args: ReadonlyArray<string> = []): Promise<SpawnOutput> =>
	gro.out(['task', TASK_PATH, ...args], { cwd: corpora });

const assert_exit_code = (result: SpawnOutput, code: number): void => {
	assert(result.kind === 'exited', `${result.kind}: ${result.stderr}`);
	assert.strictEqual(result.code, code, result.stdout + result.stderr);
};

/**
 * Builds a `corpora` project beside a sibling checkout holding one collection, `up`.
 * @returns the project's directory and the collection's commit
 */
const create_project = async (root: FsDir): Promise<{ corpora: FsDir; commit: string }> => {
	await root.mkdir('up');
	const commit = await commit_files(root.dir('up'), {
		LICENSE: 'Permission is hereby granted, free of charge',
		'src/a.ts': 'export const a = 1;\n'
	});
	await root.mkdir('corpora');
	const corpora = root.dir('corpora');
	await corpora.write(
		'manifest.json',
		JSON.stringify({
			version: MANIFEST_VERSION,
			include: ['ts'],
			collections: [
				{
					name: 'up',
					url: 'https://github.com/example/up',
					commit,
					subpaths: ['src'],
					exclude: [],
					license: { spdx: 'MIT', file: 'LICENSE' },
					shaped_by: 'none',
					origin: 'third_party'
				}
			]
		})
	);
	return { corpora, commit };
};

describe('materialize task Args', () => {
	test('defaults to a full write run', () => {
		const parsed = args_parse({}, Args);
		assert(parsed.ok);
		assert.deepEqual(parsed.value, { check: false, only: [] });
	});

	test('takes --only once or repeated', () => {
		const once = args_parse({ only: 'kit' }, Args);
		assert(once.ok);
		assert.deepEqual(once.value.only, ['kit']);
		const repeated = args_parse({ only: ['kit', 'zzz'], check: true }, Args);
		assert(repeated.ok);
		assert.deepEqual(repeated.value.only, ['kit', 'zzz']);
		assert.isTrue(repeated.value.check);
	});

	test('refuses an unknown flag and a bare --only', () => {
		assert.isFalse(args_parse({ nope: true }, Args).ok);
		assert.isFalse(args_parse({ only: true }, Args).ok);
	});
});

describe('materialize task through the CLI', () => {
	test('prints the rows, and writes then passes --check', async () => {
		await using root = await create_temp_dir();
		const { corpora, commit } = await create_project(root);

		const written = await run_task(corpora);
		assert_exit_code(written, 0);
		assert.include(
			written.stdout,
			`up                 ${commit.slice(0, 9)}      2 files    0.0 MB  none     third_party MIT`
		);
		assert.include(written.stdout, `total${' '.repeat(29)}2 files    0.0 MB`);
		assert_exit_code(await run_task(corpora, ['--check']), 0);
	});

	test('fails on a truncated file without touching it', async () => {
		await using root = await create_temp_dir();
		const { corpora } = await create_project(root);
		assert_exit_code(await run_task(corpora), 0);

		// shorter than the blob, a prefix of it: only the length check sees this
		await corpora.write('collections/up/src/a.ts', 'export');
		const drifted = await run_task(corpora, ['--check']);
		assert_exit_code(drifted, 1);
		assert.include(drifted.stdout + drifted.stderr, 'content differs: src/a.ts');
		assert.strictEqual(await corpora.read_text('collections/up/src/a.ts'), 'export');
	});

	test('fails with one exit code for an --only naming no collection', async () => {
		await using root = await create_temp_dir();
		const { corpora } = await create_project(root);
		const result = await run_task(corpora, ['--check', '--only', 'nope']);
		assert_exit_code(result, 1);
		assert.include(result.stdout + result.stderr, 'no collection named nope');
	});
});
