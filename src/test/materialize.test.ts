import { fs, type FsDir } from '@fuzdev/gro/fs.ts';
import { create_fs_paths } from '@fuzdev/gro/fs_paths.ts';
import { is_task_error } from '@fuzdev/gro/task.ts';
import { assert, describe, test } from 'vitest';

import { materialize, type MaterializeOptions } from '#lib/materialize.ts';

import { assert_task_error_includes, commit_files, create_temp_dir, git } from './test_helpers.ts';

const MIT = 'Permission is hereby granted, free of charge, to any person';

interface Fixture {
	project: FsDir & AsyncDisposable;
	siblings: FsDir & AsyncDisposable;
	commits: Record<string, string>;
	run: (options?: Partial<MaterializeOptions>) => ReturnType<typeof materialize>;
}

const to_manifest_entry = (name: string, commit: string): object => ({
	name,
	url: `https://github.com/fuzdev/${name}`,
	commit,
	subpaths: ['src'],
	exclude: [],
	license: { spdx: 'MIT', file: 'LICENSE' },
	shaped_by: 'tsv',
	origin: 'own'
});

const write_manifest = async (
	project: FsDir,
	entries: Array<[name: string, commit: string]>
): Promise<void> => {
	await project.write(
		'manifest.json',
		JSON.stringify({
			version: 2,
			include: ['ts'],
			collections: entries.map(([name, commit]) => to_manifest_entry(name, commit))
		})
	);
};

const create_fixture = async (): Promise<Fixture> => {
	const project = await create_temp_dir();
	const siblings = await create_temp_dir();
	const commits: Record<string, string> = {};
	for (const name of ['zeta', 'alpha']) {
		await siblings.mkdir(name);
		commits[name] = await commit_files(siblings.dir(name), {
			LICENSE: MIT,
			'src/a.ts': `// ${name}\n`
		});
	}
	await write_manifest(project, [
		['zeta', commits.zeta!],
		['alpha', commits.alpha!]
	]);
	const deps = { git, project, fs_paths: create_fs_paths(fs), log: () => {} };
	return {
		project,
		siblings,
		commits,
		run: (options) =>
			materialize(deps, {
				check: false,
				only: [],
				siblings_path: siblings.path,
				...options
			})
	};
};

const dispose_fixture = async (f: Fixture): Promise<void> => {
	await f.project[Symbol.asyncDispose]();
	await f.siblings[Symbol.asyncDispose]();
};

const with_fixture = (fn: (f: Fixture) => Promise<void>) => async (): Promise<void> => {
	const f = await create_fixture();
	try {
		await fn(f);
	} finally {
		await dispose_fixture(f);
	}
};

describe('materialize', () => {
	test(
		'writes collections and a stable lock, then checks clean',
		with_fixture(async (f) => {
			await f.run();
			assert.strictEqual(await f.project.read_text('collections/zeta/src/a.ts'), '// zeta\n');
			assert.strictEqual(await f.project.read_text('collections/zeta/LICENSE'), MIT);
			const lock = await f.project.read_text('lock.json');
			assert.isTrue(lock.endsWith('}\n') && !lock.endsWith('\n\n'));
			assert.isTrue(lock.startsWith('{\n\t"version": 2,\n\t"collections": {\n'));
			assert.deepEqual(Object.keys(JSON.parse(lock).collections), ['zeta', 'alpha']);
			const { problems, rows } = await f.run({ check: true });
			assert.deepEqual(problems, []);
			assert.strictEqual(rows.length, 3);
			await f.run();
			assert.strictEqual(await f.project.read_text('lock.json'), lock, 'regeneration is stable');
		})
	);

	test(
		'orders the lock by the manifest, whatever it held before',
		with_fixture(async (f) => {
			await f.run();
			await write_manifest(f.project, [
				['alpha', f.commits.alpha!],
				['zeta', f.commits.zeta!]
			]);
			await f.run();
			assert.deepEqual(
				Object.keys(JSON.parse(await f.project.read_text('lock.json')).collections),
				['alpha', 'zeta']
			);
		})
	);

	test(
		'check writes nothing',
		with_fixture(async (f) => {
			const { problems } = await f.run({ check: true });
			assert.isAbove(problems.length, 0);
			assert.isFalse(await f.project.exists('lock.json'));
			assert.isFalse(await f.project.exists('collections'));
		})
	);

	test(
		'check names each drift',
		with_fixture(async (f) => {
			await f.run();
			const lock = await f.project.read_text('lock.json');
			await f.project.write('collections/zeta/src/a.ts', '// flipped\n');
			await f.project.write('collections/alpha/stray.ts', 'x');
			await f.project.remove('collections/alpha/src/a.ts');
			await f.project.mkdir('collections/removed');
			await f.project.write('collections/removed/x.ts', 'x');
			const edited_lock = JSON.parse(lock);
			edited_lock.collections.alpha.digest = 'sha256:' + '0'.repeat(64);
			edited_lock.collections.gone = edited_lock.collections.alpha;
			edited_lock.version = 1;
			await f.project.write('lock.json', JSON.stringify(edited_lock, null, '\t') + '\n');
			const { problems } = await f.run({ check: true });
			for (const text of [
				'zeta: content differs: src/a.ts',
				'alpha: not in the pinned tree: stray.ts',
				'alpha: missing on disk: src/a.ts',
				'alpha: lock.json entry is stale',
				'collections/removed: not in manifest.json',
				'lock.json: entry "gone" is not in manifest.json',
				'lock.json: version 1 is not 2'
			]) {
				assert.isTrue(
					problems.some((p) => p.includes(text)),
					`expected "${text}" in:\n${problems.join('\n')}`
				);
			}
		})
	);

	test(
		'a collection with no lock entry is reported',
		with_fixture(async (f) => {
			await f.run();
			const lock = JSON.parse(await f.project.read_text('lock.json'));
			delete lock.collections.alpha;
			await f.project.write('lock.json', JSON.stringify(lock, null, '\t') + '\n');
			const { problems } = await f.run({ check: true });
			assert.deepEqual(problems, ['alpha: no lock.json entry']);
		})
	);

	test(
		'write mode removes what the manifest dropped',
		with_fixture(async (f) => {
			await f.run();
			await write_manifest(f.project, [['alpha', f.commits.alpha!]]);
			await f.run();
			assert.isFalse(await f.project.exists('collections/zeta'));
			assert.deepEqual(
				Object.keys(JSON.parse(await f.project.read_text('lock.json')).collections),
				['alpha']
			);
		})
	);

	test(
		'only limits the check and leaves the rest of the lock in manifest order',
		with_fixture(async (f) => {
			await f.run();
			await f.project.write('collections/zeta/src/a.ts', '// flipped\n');
			const only_alpha = await f.run({ check: true, only: ['alpha'] });
			assert.deepEqual(only_alpha.problems, []);
			const only_zeta = await f.run({ check: true, only: ['zeta'] });
			assert.lengthOf(only_zeta.problems, 1);

			// a dropped collection's leftovers survive an only run
			await f.project.write('collections/zeta/src/a.ts', '// zeta\n');
			await write_manifest(f.project, [['alpha', f.commits.alpha!]]);
			const before = await f.project.read_text('lock.json');
			await f.run({ only: ['alpha'] });
			assert.isTrue(await f.project.exists('collections/zeta/src/a.ts'));
			const after = JSON.parse(await f.project.read_text('lock.json'));
			assert.deepEqual(Object.keys(after.collections), ['alpha', 'zeta']);
			assert.deepEqual(after.collections.zeta, JSON.parse(before).collections.zeta);
		})
	);

	test(
		'an unknown only is a usage error',
		with_fixture(async (f) => {
			try {
				await f.run({ check: true, only: ['nope'] });
			} catch (error) {
				assert(is_task_error(error), String(error));
				assert.include(error.message, 'no collection named nope');
				return;
			}
			assert.fail('expected a usage error');
		})
	);

	test(
		'summarizes each collection and the total',
		with_fixture(async (f) => {
			const commit = await commit_files(f.siblings.dir('alpha'), {
				'src/big.ts': 'x'.repeat(1_500_000)
			});
			await write_manifest(f.project, [
				['alpha', commit],
				['zeta', f.commits.zeta!]
			]);
			const { rows } = await f.run({ check: true });
			const zeta_bytes = MIT.length + '// zeta\n'.length;
			assert.strictEqual(
				rows[1],
				`zeta               ${f.commits.zeta!.slice(0, 9)}      2 files    0.0 MB  tsv      own         MIT`
			);
			assert.strictEqual(
				rows[0],
				`alpha              ${commit.slice(0, 9)}      3 files    1.5 MB  tsv      own         MIT`
			);
			// the files and bytes of every row, in the same units
			const total_bytes = zeta_bytes + (MIT.length + '// alpha\n'.length + 1_500_000);
			assert.strictEqual(
				rows[2],
				`total${' '.repeat(29)}5 files  ${`${(total_bytes / 1e6).toFixed(1)} MB`.padStart(8)}`
			);
		})
	);

	test(
		'malformed JSON names the file',
		with_fixture(async (f) => {
			await f.project.write('lock.json', '{not json');
			await assert_task_error_includes(f.run(), 'lock.json is not valid JSON');
			await f.project.write('manifest.json', '{not json');
			await assert_task_error_includes(f.run(), 'manifest.json is not valid JSON');
		})
	);

	test(
		'a lock that is not the lock shape names the file',
		with_fixture(async (f) => {
			await f.project.write('lock.json', JSON.stringify({ version: 2, collections: { zeta: {} } }));
			await assert_task_error_includes(f.run(), 'lock.json is invalid');
			await f.project.write('lock.json', JSON.stringify({ version: 2, collections: {}, extra: 1 }));
			await assert_task_error_includes(f.run(), 'lock.json is invalid');
			const entry = { commit: 'c', files: 1, bytes: 2, digest: 'd', extra: 1 };
			await f.project.write(
				'lock.json',
				JSON.stringify({ version: 2, collections: { zeta: entry } })
			);
			await assert_task_error_includes(f.run(), 'lock.json is invalid');
		})
	);

	test(
		'a malformed lock is refused with the way out, in write mode too',
		with_fixture(async (f) => {
			await f.project.write('lock.json', JSON.stringify({ version: 2, collections: {}, extra: 1 }));
			await assert_task_error_includes(f.run(), 'Delete lock.json and run');
			await f.project.write('lock.json', '{not json');
			await assert_task_error_includes(f.run(), 'Delete lock.json and run');
			await f.project.remove('lock.json');
			await f.run();
			assert.isTrue(await f.project.exists('lock.json'));
		})
	);

	test(
		'refuses a lock whose version or counts are not numbers of that shape',
		with_fixture(async (f) => {
			await f.run();
			const lock = JSON.parse(await f.project.read_text('lock.json'));
			await f.project.write('lock.json', JSON.stringify({ ...lock, version: 'two' }));
			await assert_task_error_includes(f.run({ check: true }), 'lock.json is invalid');
			lock.collections.alpha.files = 1.5;
			await f.project.write('lock.json', JSON.stringify(lock));
			await assert_task_error_includes(f.run({ check: true }), 'collections.alpha.files');
		})
	);

	test(
		'a parsed lock writes back byte-identical',
		with_fixture(async (f) => {
			await f.run();
			const lock = await f.project.read_text('lock.json');
			await f.run();
			assert.strictEqual(await f.project.read_text('lock.json'), lock);
		})
	);

	test(
		'an invalid manifest fails naming the problem',
		with_fixture(async (f) => {
			await f.project.write('manifest.json', JSON.stringify({ version: 1 }));
			await assert_task_error_includes(f.run(), 'manifest.json is invalid');
		})
	);
});
