import { meta } from '@fuzdev/fuz_schema/meta.ts';
import * as s from '@fuzdev/fuz_schema/schema.ts';
import { fs } from '@fuzdev/gro/fs.ts';
import { create_fs_paths } from '@fuzdev/gro/fs_paths.ts';
import { to_git_program } from '@fuzdev/gro/git.ts';
import { spawn } from '@fuzdev/gro/spawn.ts';
import { TaskError, type Task } from '@fuzdev/gro/task.ts';

import { materialize } from './materialize.ts';

/** The most differences printed, so a drifted checkout's failure stays readable. */
const MAX_PRINTED_PROBLEMS = 50;

/**
 * What git reaches beyond the base environment: `XDG_CONFIG_HOME` for the user's config and
 * the proxy variables for a fetch. `GIT_*` stays out, since a `GIT_DIR` inherited from a hook
 * would redirect git away from the directory each call names.
 */
const GIT_PASS_ENV: ReadonlyArray<string> = [
	'XDG_CONFIG_HOME',
	'HTTP_PROXY',
	'HTTPS_PROXY',
	'ALL_PROXY',
	'NO_PROXY',
	'http_proxy',
	'https_proxy',
	'all_proxy',
	'no_proxy'
];

export const Args = s.object({
	check: s.with_default(
		meta(s.boolean, {
			description:
				'compare the committed collections/ and lock.json with a fresh materialization, exiting 1 on any difference'
		}),
		false
	),
	// the default is outside the pipe, already an array, so it skips the transform
	only: s.with_default_fn(
		s.pipe(
			meta(s.union([s.string, s.array(s.string)]), {
				description: 'limit to these collections, repeatable'
			}),
			s.transform((v: string | Array<string>) => (Array.isArray(v) ? v : [v]))
		),
		() => []
	)
});
export type Args = s.Infer<typeof Args>;

export const task: Task<Args> = {
	summary: 'materialize collections/ from manifest.json, or with --check verify they reproduce',
	Args,
	run: async ({ args, log }) => {
		const { check, only } = args;
		const git = to_git_program(spawn, { pass_env: GIT_PASS_ENV });
		const { rows, problems } = await materialize(
			{ git, project: fs.project, fs_paths: create_fs_paths(fs), log: (m) => log.info(m) },
			{ check, only, siblings_path: '..' }
		);

		log.raw(rows.join('\n'));

		if (problems.length > 0) {
			const printed = problems.slice(0, MAX_PRINTED_PROBLEMS).map((p) => `  ${p}`);
			if (problems.length > MAX_PRINTED_PROBLEMS) {
				printed.push(`  … and ${problems.length - MAX_PRINTED_PROBLEMS} more`);
			}
			throw new TaskError(
				`${problems.length} difference(s) between manifest.json and the committed snapshot:\n` +
					printed.join('\n') +
					'\n\nRun `npm run materialize` and commit the result if the manifest change was deliberate.'
			);
		}
		if (check) log.info('✓ collections/ and lock.json reproduce from manifest.json');
	}
};
