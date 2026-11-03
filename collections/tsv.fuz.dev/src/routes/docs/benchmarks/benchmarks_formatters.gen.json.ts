import type { Gen } from '@fuzdev/gro/gen.ts';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parse_formatter_benchmarks } from './formatter_benchmark_data.ts';

// The formatter comparison harness lives in a sibling checkout and publishes its
// numbers as `results.json` — see `formatter_benchmark_data.ts`. Resolved from this
// module rather than the cwd: a missing report is a benign skip, so resolving
// against the cwd would turn a `gro gen` run from a subdirectory into a silent
// no-op that `gro gen --check` still passes.
const RESULTS_PATH = fileURLToPath(
	new URL('../../../../../oxc-bench-formatter/results.json', import.meta.url)
);

/**
 * Generate `benchmarks_formatters.json` from the sibling formatter-benchmark
 * harness's `results.json`.
 *
 * A MISSING report is the one tolerated case — the sibling checkout is optional,
 * so generation is skipped, the committed JSON stands, and `gro gen --check`
 * passes on a machine (or CI) that has only this repo. A report that IS present
 * but doesn't validate fails the task instead: the alternative is quietly
 * publishing stale or scenario-stripped numbers.
 */
export const gen: Gen = {
	generate: async ({ log }) => {
		let results;
		try {
			results = await readFile(RESULTS_PATH, 'utf8');
		} catch (error) {
			// only "it isn't there" is benign; an unreadable file is a real problem
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			log.info(`skipping formatter benchmarks, no report at ${RESULTS_PATH}`);
			return null;
		}

		let benchmarks;
		try {
			benchmarks = parse_formatter_benchmarks(JSON.parse(results));
		} catch (error) {
			// name the report: gro names this module, not the file that failed to validate
			throw new Error(`invalid formatter benchmarks report at ${RESULTS_PATH}`, { cause: error });
		}
		log.info(`read ${benchmarks.scenarios.length} tsv scenario(s) from ${RESULTS_PATH}`);
		// indented here: gro's gen formats no JSON (tsv has no JSON formatter yet), so
		// the output is committed exactly as returned, tab-indented like the copied reports
		return JSON.stringify(benchmarks, null, '\t') + '\n';
	},
	// outside the root and `watch.dir`, so `gro dev` doesn't rerun on a change to it
	inputs: { files: [RESULTS_PATH] }
};
