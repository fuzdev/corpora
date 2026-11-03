import type { BaselineEntry, BenchmarkBaseline } from '#routes/docs/benchmarks/benchmark_data.ts';
import type {
	FormatterPreflight,
	FormatterScenario,
	FormatterTiming
} from '#routes/docs/benchmarks/formatter_benchmark_data.ts';

/**
 * The report shape version the committed perf copy (`benchmarks.json`) is pinned to —
 * tsv's `REPORT_SCHEMA_VERSION` as of the run that produced it. Exact rather than a
 * floor, so `npm run update-benchmarks` pulling a newer shape fails the shape tests
 * until `benchmark_data.ts` mirrors the new fields and this is re-pinned.
 */
export const REPORT_VERSION = 22;

/**
 * `REPORT_VERSION` for the conformance copy (`conformance.json`). A separate pin
 * because the two copies come from separate runs: a field only the conformance
 * report carries moves tsv's version with no reason to re-run the perf bench.
 */
export const CONFORMANCE_REPORT_VERSION = 22;

/** A stable, timed `BaselineEntry`, which each test overrides the fields it reads. */
export const create_baseline_entry = (overrides: Partial<BaselineEntry> = {}): BaselineEntry => ({
	name: 'x',
	group: 'format/css',
	mean_ns: 1,
	p50_ns: 1,
	p75_ns: 1,
	p90_ns: 1,
	p95_ns: 1,
	p99_ns: 1,
	min_ns: 1,
	max_ns: 1,
	std_dev_ns: 0,
	cv: 0.01,
	ops_per_second: 1,
	sample_size: 100,
	cv_raw: 0.01,
	drift: 0,
	raw_sample_size: 100,
	outlier_ratio: 0,
	warmup_iterations: 3,
	min_iterations: 8,
	settled_heap_bytes: 1,
	files_iterated_digest: null,
	files_processed: null,
	files_total: null,
	files_iterated: null,
	payload: null,
	runtime: 'node',
	...overrides
});

/**
 * A minimal healthy per-runtime report with no entries, so a unit test states the
 * whole input it reads rather than inheriting the committed report's.
 */
export const create_baseline = (overrides: Partial<BenchmarkBaseline> = {}): BenchmarkBaseline => ({
	version: REPORT_VERSION,
	runtime: 'node',
	timestamp: '2026-01-01T00:00:00.000Z',
	git_commit: 'abc1234',
	corpus: { svelte: 10, typescript: 20, css: 5 },
	versions: {
		tsv: '0.0.0',
		svelte: '0.0.0',
		acorn: '0.0.0',
		acorn_ts: '0.0.0',
		prettier: '0.0.0',
		prettier_svelte: '0.0.0'
	},
	binary_sizes: [],
	entries: [],
	suppressed_noise: {},
	variant_parity: [],
	corpus_kind: 'perf',
	corpus_sources: [],
	machine: { cpu_model: 'cpu', os: 'linux', arch: 'x64', runtime_version: '24.14.1' },
	binary_sizes_absent: [],
	unavailable: [],
	output_digest_ungraded: {},
	...overrides
});

// A trimmed stand-in for the bench harness's `results.json`, built from factories
// so each test states only what it changes.
export const create_formatter_timing = (name: string, mean_ms: number): FormatterTiming => ({
	name,
	mean_ms,
	stddev_ms: 0.5,
	user_ms: mean_ms * 2,
	system_ms: mean_ms,
	min_ms: mean_ms - 1,
	max_ms: mean_ms + 1
});

export const create_formatter_preflight = (
	name: string,
	overrides: Partial<FormatterPreflight> = {}
): FormatterPreflight => ({
	name,
	rejected: 0,
	unavailable: false,
	crashed: false,
	...overrides
});

/** A timed scenario tsv runs in, facing one other tool. */
export const create_formatter_scenario = (
	overrides: Partial<FormatterScenario> = {}
): FormatterScenario => ({
	id: 'large-single-file',
	name: 'Large Single File',
	target: 'TypeScript compiler parser.ts (~540KB)',
	corpus: '539588 bytes, sha256:dcddb577aa14',
	warmup_runs: 3,
	benchmark_runs: 20,
	preflight: [create_formatter_preflight('oxfmt'), create_formatter_preflight('tsv')],
	timings: [create_formatter_timing('oxfmt', 60), create_formatter_timing('tsv', 20)],
	fastest: 'tsv',
	speedups: [{ name: 'oxfmt', ratio: 3, ratio_stddev: 0.1 }],
	memory: [
		{ name: 'oxfmt', mean_mb: 100, min_mb: 99, max_mb: 101, ratio: 10, ratio_stddev: 0.5 },
		{ name: 'tsv', mean_mb: 10, min_mb: 9, max_mb: 11 }
	],
	...overrides
});

/**
 * A scenario that never reached timing — no timings, speedups, or memory, and no
 * `fastest` key, as the harness records one.
 */
export const create_untimed_formatter_scenario = (
	overrides: Partial<FormatterScenario> = {}
): FormatterScenario => {
	const { fastest: _, ...scenario } = create_formatter_scenario({
		timings: [],
		speedups: [],
		memory: [],
		...overrides
	});
	return scenario;
};
