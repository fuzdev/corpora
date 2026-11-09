import { fs, type FsDir } from '@fuzdev/gro/fs.ts';
import { spawn, type SpawnProgram } from '@fuzdev/gro/spawn.ts';
import { is_task_error, TaskError } from '@fuzdev/gro/task.ts';
import { assert } from 'vitest';

/** The program the tests run git through, with only the base environment. */
export const git: SpawnProgram = spawn.program('git');

const COMMITTER = [
	'-c',
	'user.name=corpora-test',
	'-c',
	'user.email=test@example.invalid',
	'-c',
	'commit.gpgsign=false',
	'-c',
	'core.hooksPath=/dev/null'
];

const run_git = async (dir: FsDir, args: ReadonlyArray<string>): Promise<string> => {
	const result = await git.out(args, { cwd: dir });
	if (result.kind !== 'exited' || result.code !== 0) {
		throw new TaskError(`git ${args.join(' ')} failed: ${result.stderr}`);
	}
	return result.stdout.trim();
};

/**
 * Commits `files` into a new repo at `dir`, one commit per call.
 * @returns the commit's oid
 */
export const commit_files = async (
	dir: FsDir,
	files: Record<string, string | Uint8Array>
): Promise<string> => {
	if (!(await dir.exists('.git'))) await run_git(dir, ['init', '-q', '-b', 'main']);
	for (const [path, content] of Object.entries(files)) {
		const slash = path.lastIndexOf('/');
		if (slash !== -1) {
			await dir.mkdir(path.slice(0, slash), { recursive: true, exists_ok: true });
		}
		await dir.write(path, content);
	}
	await run_git(dir, ['add', '-A']);
	await run_git(dir, [...COMMITTER, 'commit', '-q', '--allow-empty', '-m', 'fixture']);
	return run_git(dir, ['rev-parse', 'HEAD']);
};

/** Adds a symlink at `path` pointing at `target`, committed. */
export const commit_symlink = async (dir: FsDir, path: string, target: string): Promise<string> => {
	await spawn.program('ln').run(['-s', target, path], { cwd: dir });
	return commit_files(dir, {});
};

/** Commits a gitlink (a submodule entry) at `path` pointing at `oid`. */
export const commit_gitlink = async (dir: FsDir, path: string, oid: string): Promise<string> => {
	await run_git(dir, ['update-index', '--add', '--cacheinfo', `160000,${oid},${path}`]);
	await run_git(dir, [...COMMITTER, 'commit', '-q', '-m', 'fixture']);
	return run_git(dir, ['rev-parse', 'HEAD']);
};

/**
 * Commits one file under each of `paths`, raw bytes a JS string can't hold, through the index.
 * @param mode - the entries' git mode, `120000` for symlinks
 * @returns the commit's oid
 */
export const commit_raw_paths = async (
	dir: FsDir,
	paths: ReadonlyArray<Uint8Array>,
	mode = '100644'
): Promise<string> => {
	if (!(await dir.exists('.git'))) await run_git(dir, ['init', '-q', '-b', 'main']);
	const encoder = new TextEncoder();
	const hashed = await git.out_bytes(['hash-object', '-w', '--stdin'], {
		cwd: dir,
		stdin: encoder.encode('raw\n')
	});
	const oid = new TextDecoder().decode(hashed.stdout).trim();
	const prefix = encoder.encode(`${mode} ${oid}\t`);
	const rows = paths.flatMap((p) => [...prefix, ...p, 0]);
	const indexed = await git.out_bytes(['update-index', '-z', '--index-info'], {
		cwd: dir,
		stdin: new Uint8Array(rows)
	});
	if (indexed.kind !== 'exited' || indexed.code !== 0) throw new TaskError('update-index failed');
	await run_git(dir, [...COMMITTER, 'commit', '-q', '--allow-empty', '-m', 'fixture']);
	return run_git(dir, ['rev-parse', 'HEAD']);
};

/** A fresh temp directory removed when the test's scope ends. */
export const create_temp_dir = (): Promise<FsDir & AsyncDisposable> => fs.temp_dir('corpora-test-');

/** Asserts `promise` rejects with a `TaskError` whose message includes `text`. */
export const assert_task_error_includes = async (
	promise: Promise<unknown>,
	text: string
): Promise<void> => {
	try {
		await promise;
	} catch (error) {
		assert(is_task_error(error), String(error));
		assert.include(error.message, text);
		return;
	}
	assert.fail(`expected a TaskError including "${text}"`);
};
