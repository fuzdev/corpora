/**
 * Thin git helpers: every subprocess the materializer runs. Output is bytes, because
 * blob content is copied verbatim.
 *
 * @module
 */

const decoder = new TextDecoder();

/** Runs `git` with `args` in `cwd`; throws with stderr on a non-zero exit. */
export const git = async (args: string[], cwd: string): Promise<Uint8Array> => {
	const { code, stdout, stderr } = await new Deno.Command('git', {
		args,
		cwd,
		stdout: 'piped',
		stderr: 'piped'
	}).output();
	if (code !== 0) {
		throw new Error(`git ${args.join(' ')} (in ${cwd}) failed:\n${decoder.decode(stderr).trim()}`);
	}
	return stdout;
};

/** Like `git`, decoded and trimmed. */
export const git_text = async (args: string[], cwd: string): Promise<string> =>
	decoder.decode(await git(args, cwd)).trim();

/** Whether the repo at `cwd` has `commit` as a commit object. */
export const has_commit = async (cwd: string, commit: string): Promise<boolean> => {
	const { code } = await new Deno.Command('git', {
		args: ['cat-file', '-e', `${commit}^{commit}`],
		cwd,
		stdout: 'null',
		stderr: 'null'
	}).output();
	return code === 0;
};

/** One `git ls-tree -r -l` row. */
export interface TreeEntry {
	/** `100644`, `100755` (blobs), `120000` (symlink) or `160000` (submodule). */
	mode: string;
	oid: string;
	size: number;
	/** Repo-relative path. */
	path: string;
}

/** Recursively lists the tree at `commit` under `subpath`, blobs and symlinks alike. */
export const ls_tree = async (
	cwd: string,
	commit: string,
	subpath: string
): Promise<TreeEntry[]> => {
	const out = decoder.decode(await git(['ls-tree', '-r', '-l', '-z', commit, '--', subpath], cwd));
	const entries: TreeEntry[] = [];
	for (const row of out.split('\0')) {
		if (row.length === 0) continue;
		const tab = row.indexOf('\t');
		const [mode, type, oid, size] = row.slice(0, tab).split(/\s+/);
		if (type !== 'blob') continue; // submodules (`commit`) carry no bytes here
		entries.push({ mode, oid, size: Number(size), path: row.slice(tab + 1) });
	}
	return entries;
};

/**
 * Reads many blobs in one `git cat-file --batch` round trip, keyed by oid. Stdout is
 * collected concurrently with the stdin write so neither pipe can fill and deadlock.
 */
export const cat_blobs = async (
	cwd: string,
	oids: readonly string[]
): Promise<Map<string, Uint8Array>> => {
	const blobs = new Map<string, Uint8Array>();
	if (oids.length === 0) return blobs;
	const proc = new Deno.Command('git', {
		args: ['cat-file', '--batch'],
		cwd,
		stdin: 'piped',
		stdout: 'piped',
		stderr: 'piped'
	}).spawn();
	const output = proc.output();
	const writer = proc.stdin.getWriter();
	await writer.write(new TextEncoder().encode(oids.join('\n') + '\n'));
	await writer.close();
	const { code, stdout, stderr } = await output;
	if (code !== 0) {
		throw new Error(`git cat-file --batch (in ${cwd}) failed:\n${decoder.decode(stderr).trim()}`);
	}
	let i = 0;
	while (i < stdout.length) {
		const nl = stdout.indexOf(10, i);
		if (nl === -1) throw new Error('git cat-file --batch: truncated header');
		const header = decoder.decode(stdout.subarray(i, nl));
		const [oid, type, size_str] = header.split(' ');
		if (type === 'missing' || type === undefined) {
			throw new Error(`git cat-file --batch: object ${oid} is ${type ?? 'unreadable'}`);
		}
		const size = Number(size_str);
		const start = nl + 1;
		blobs.set(oid, stdout.slice(start, start + size));
		i = start + size + 1; // the trailing newline after the content
	}
	return blobs;
};
