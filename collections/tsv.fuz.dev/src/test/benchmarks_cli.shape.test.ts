import { assert, describe, test } from 'vitest';

import { benchmarks_json } from '#routes/docs/benchmarks/benchmarks.ts';
import { benchmarks_formatters_json } from '#routes/docs/benchmarks/benchmarks_formatters.ts';
import {
	benchmarks_cli,
	cli_default_anchor_label,
	CLI_DELIVERY_KEY,
	CLI_SCENARIO_KEYS,
	CLI_SINGLE_FILE_KEY,
	CLI_TSV_LABEL,
	CLI_TSV_NPM_LABEL
} from '#routes/docs/benchmarks/benchmarks_cli.ts';

// Shape gate for the CLI report `benchmarks_cli.ts` derives from the generated
// `benchmarks_formatters.json`. The generator validates the harness's report
// against a schema, which can't know the page's scenario ids: a renamed scenario
// would validate and then silently drop from the page, or lose the `tsv` row its
// table anchors on, rather than fail to typecheck.
describe('benchmarks_cli shape', () => {
	test('every scenario the page has prose for resolved to generated data, in prose order', () => {
		// a copy entry with no matching scenario id drops silently from the table, so
		// every entry must resolve — an aborted scenario resolves too, it just
		// renders its abort note instead of a table
		assert.deepEqual(
			benchmarks_cli.scenarios.map((s) => s.key),
			CLI_SCENARIO_KEYS
		);
	});

	test('every timed scenario carries a tsv reference row with positive metrics', () => {
		assert.isAtLeast(benchmarks_cli.scenarios.length, 1);
		for (const scenario of benchmarks_cli.scenarios) {
			// an aborted scenario carries its note; one aborted before timing has no
			// rows to anchor, one aborted in its memory pass keeps its timed rows
			if (scenario.aborted !== undefined) {
				assert.isNotEmpty(scenario.aborted, `${scenario.key} aborted without a note`);
				if (scenario.results.length === 0) continue;
			}
			// BenchmarksCli anchors every ratio on the tsv row; without it the table is empty
			assert.ok(
				scenario.results.some((r) => r.label === 'tsv'),
				`${scenario.key} is missing its tsv row`
			);
			for (const r of scenario.results) {
				// the schema already makes `wall_ms` and `memory_mb` positive; `cpu_ms` sums
				// two nonnegative halves, so only it can still be zero
				assert.isAbove(r.cpu_ms, 0, `${scenario.key}/${r.label} cpu_ms`);
			}
		}
	});

	test("the derived wall-clock ratios agree with hyperfine's own summary", () => {
		// The generated report carries the harness's own `Summary` ratios beside the
		// raw timings. Recomputing them from the timings and comparing catches a
		// report whose rows and ratios came apart — a unit slip, a mislabeled row —
		// which would otherwise render plausible-but-wrong numbers.
		for (const scenario of benchmarks_formatters_json.scenarios) {
			if (scenario.timings.length === 0) {
				// aborted before timing: no fastest row and nothing to cross-check
				assert.isDefined(scenario.aborted, `${scenario.id} has no timings and no abort`);
				assert.isEmpty(scenario.speedups, `${scenario.id} aborted but carries speedups`);
				continue;
			}
			// hyperfine anchors its summary on the fastest row, so that is the denominator
			// — read off the report rather than assumed to be tsv, which would make this
			// gate "tsv must win" and fail CI on an honest slower run instead of
			// publishing it. That `fastest` names the row the timings agree is fastest is
			// the claim worth checking.
			const fastest = scenario.timings.reduce((a, b) => (a.mean_ms <= b.mean_ms ? a : b));
			assert.strictEqual(scenario.fastest, fastest.name, `${scenario.id} fastest`);
			// from the raw timings, not the rendered report: the generated data also
			// carries tsv scenarios the page has no copy for, and their numbers must
			// parse just as soundly
			assert(
				scenario.timings.some((t) => t.name === 'tsv'),
				`${scenario.id} has no tsv timing row`
			);
			for (const speedup of scenario.speedups) {
				const other = scenario.timings.find((t) => t.name === speedup.name);
				assert(other, `${scenario.id}/${speedup.name} has no timing row`);
				const derived = other.mean_ms / fastest.mean_ms;
				// the harness derives the ratio from full-precision means and records both
				// rounded, so recomputing lands within a fraction of a percent — wide enough
				// for that, far too tight to hide a slip (a wrong unit would be off by 1000x)
				assert.closeTo(
					derived,
					speedup.ratio,
					speedup.ratio * 0.01,
					`${scenario.id}/${speedup.name}`
				);
			}
		}
	});

	test("the derived memory ratios agree with the harness's own", () => {
		// the memory counterpart of the check above: the page derives its ratios from
		// the mean peaks, and the report carries the harness's ratio beside each
		for (const scenario of benchmarks_formatters_json.scenarios) {
			const rows = scenario.memory.filter((m) => m.ratio !== undefined);
			if (rows.length === 0) continue; // no memory pass, or none measured against a baseline
			const tsv = scenario.memory.find((m) => m.name === 'tsv');
			assert(tsv, `${scenario.id} has memory ratios but no tsv row to take them against`);
			assert.notProperty(tsv, 'ratio', `${scenario.id}: the baseline row carries a ratio`);
			for (const row of rows) {
				// the harness divides full-precision means and the report may carry them
				// rounded to a tenth of a megabyte, which moves a ratio by up to ~1%
				assert.closeTo(
					row.mean_mb / tsv.mean_mb,
					row.ratio!,
					row.ratio! * 0.02,
					`${scenario.id}/${row.name}`
				);
			}
		}
	});

	test('the two scenarios that time tsv on the same file agree', () => {
		// the delivery and large-single-file scenarios run the bare binary and the
		// dispatcher over the same parser.ts in separate hyperfine sessions, so their
		// means are one measurement taken twice — a gap between them is the run-to-run
		// noise every ratio on the page carries, and a wide one says to re-run
		const rows = (key: string) => {
			const scenario = benchmarks_cli.scenarios.find((s) => s.key === key);
			assert(scenario, `no generated scenario has id "${key}"`);
			return scenario;
		};
		const delivery = rows(CLI_DELIVERY_KEY);
		const single = rows(CLI_SINGLE_FILE_KEY);
		assert.strictEqual(delivery.target.split(',')[0], single.target, 'same corpus file');
		// the provenance is the stronger claim: same bytes, not just the same label
		assert.strictEqual(delivery.corpus, single.corpus, 'same corpus revision');
		for (const label of [CLI_TSV_LABEL, CLI_TSV_NPM_LABEL]) {
			const a = delivery.results.find((r) => r.label === label);
			const b = single.results.find((r) => r.label === label);
			assert(a && b, `${label} is missing from one of the two scenarios`);
			assert.closeTo(a.wall_ms, b.wall_ms, b.wall_ms * 0.1, `${label} wall_ms`);
		}
	});

	test('every rendered scenario names the corpus revision it ran on', () => {
		// the page prints the provenance under each table, and it is what says which
		// pin of the corpus a run used — an empty or unknown one would leave numbers
		// no rerun can be compared against
		for (const scenario of benchmarks_cli.scenarios) {
			assert.isNotEmpty(scenario.corpus, `${scenario.key} records no corpus`);
			assert.notMatch(scenario.corpus, /unknown|not a git checkout/, scenario.key);
		}
	});

	test('every formatter accepts the whole corpus in every timed scenario, as the page claims', () => {
		// The page's notes say the preflight asserts every formatter parses every file, so
		// no formatter is credited for skipping files. That's a claim about the data —
		// for the scenarios that were timed. An aborted one is the harness saying the
		// opposite, and the page shows it as an abort, so its rows are exempt.
		for (const scenario of benchmarks_formatters_json.scenarios) {
			assert.isNotEmpty(scenario.preflight, `${scenario.id} ran no preflight`);
			// aborted before timing — its rows are the fault, shown as such
			if (scenario.timings.length === 0) continue;
			for (const entry of scenario.preflight) {
				assert.isFalse(entry.crashed, `${scenario.id}/${entry.name} crashed during its check`);
				assert.strictEqual(entry.rejected, 0, `${scenario.id}/${entry.name} rejected files`);
				assert.isFalse(entry.unavailable, `${scenario.id}/${entry.name} never launched`);
			}
		}
	});
});

describe('cli_default_anchor_label', () => {
	test('every rendered scenario the report timed has an anchor', () => {
		for (const scenario of benchmarks_cli.scenarios) {
			if (scenario.results.length === 0) continue; // aborted before timing
			assert.strictEqual(
				cli_default_anchor_label(scenario),
				scenario.tsv_only ? CLI_TSV_LABEL : CLI_TSV_NPM_LABEL,
				scenario.key
			);
		}
	});
});

// The CLI harness and tsv's in-process bench each record their own machine and
// tool versions. The page states them once, in the Benchmarking details section,
// from tsv's report — so the harness's must agree, and a refresh of one source
// without the other fails here rather than publishing numbers from two setups.
describe('the CLI report matches the in-process one', () => {
	const REFRESH = 'refresh both reports on the same setup (see CLAUDE.md, Benchmarks)';

	test('same machine', () => {
		const { cpu_model, os, arch } = benchmarks_cli.machine;
		const { runtime_version: _, ...in_process } = benchmarks_json.machine;
		assert.deepEqual({ cpu_model, os, arch }, in_process, REFRESH);
	});

	test('same Node', () => {
		assert.strictEqual(benchmarks_json.runtime, 'node');
		assert.strictEqual(
			benchmarks_cli.versions.node,
			benchmarks_json.machine.runtime_version,
			REFRESH
		);
	});

	test('same versions of every tool both time', () => {
		// the harness keys by npm-bin name, tsv's report by identifier
		const in_process_versions = new Map(Object.entries(benchmarks_json.versions));
		const shared = Object.entries(benchmarks_cli.versions).flatMap(([name, cli]) => {
			const in_process = in_process_versions.get(name.replaceAll('-', '_'));
			return in_process === undefined ? [] : [{ name, cli, in_process }];
		});
		// guards against a key rename leaving nothing to compare
		assert.includeMembers(
			shared.map((s) => s.name),
			['tsv', 'prettier', 'biome', 'oxfmt', 'rsvelte-fmt']
		);
		for (const { name, cli, in_process } of shared) {
			assert.strictEqual(cli, in_process, `${name}: ${REFRESH}`);
		}
	});

	test('the harness-only facts the details section quotes resolve', () => {
		assert.isDefined(benchmarks_cli.versions['tsv-wasm']);
	});
});
