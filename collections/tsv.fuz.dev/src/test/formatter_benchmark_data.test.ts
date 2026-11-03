import { assert, describe, test } from 'vitest';

import { benchmarks_formatters_json } from '#routes/docs/benchmarks/benchmarks_formatters.ts';
import {
	parse_formatter_benchmarks,
	type FormatterBenchmarks,
	type FormatterScenario
} from '#routes/docs/benchmarks/formatter_benchmark_data.ts';

import {
	create_formatter_preflight,
	create_formatter_scenario,
	create_formatter_timing,
	create_untimed_formatter_scenario
} from './benchmark_test_helpers.ts';

// one scenario tsv runs in, one it sits out
const timing = create_formatter_timing;
const preflight = create_formatter_preflight;
const scenario = create_formatter_scenario;
const untimed = create_untimed_formatter_scenario;

// an upstream scenario: JSX in the corpus, so no tsv row and no preflight
const jsx_scenario = (overrides: Partial<FormatterScenario> = {}): FormatterScenario =>
	scenario({
		id: 'js-ts-no-embedded',
		name: 'JS/TS (no embedded)',
		target: 'Outline repository (js/ts/tsx only)',
		corpus: '8cf997c 2026-07-14',
		preflight: [],
		timings: [timing('biome', 300), timing('oxfmt', 120)],
		fastest: 'oxfmt',
		speedups: [{ name: 'biome', ratio: 2.5, ratio_stddev: 0.1 }],
		memory: [],
		...overrides
	});

const report = (overrides: Partial<FormatterBenchmarks> = {}): FormatterBenchmarks => ({
	timestamp: '2026-09-20T11:00:00.000Z',
	git_commit: 'abc1234',
	git_dirty: false,
	machine: { cpu_model: 'Some CPU', threads: 12, os: 'linux', arch: 'x86_64' },
	node_startup: { mean_ms: 19, stddev_ms: 0.7, runs: 20 },
	versions: { prettier: '3.9.6', oxfmt: '0.68.0', tsv: '0.4.0' },
	tsv_binary: { source: 'package', package: '@fuzdev/tsv-linux-x64-gnu' },
	scenarios: [scenario(), jsx_scenario()],
	...overrides
});

describe('parse_formatter_benchmarks', () => {
	test('keeps only the scenarios tsv runs in', () => {
		const parsed = parse_formatter_benchmarks(report());
		assert.deepEqual(
			parsed.scenarios.map((s) => s.id),
			['large-single-file']
		);
		assert.deepEqual(parsed.scenarios[0], scenario());
	});

	test('carries the run-level fields through', () => {
		const { scenarios: _, ...parsed } = parse_formatter_benchmarks(report());
		const { scenarios: __, ...expected } = report();
		assert.deepEqual(parsed, expected);
	});

	test('rejects a tsv binary with no source it knows', () => {
		assert.throws(
			() => parse_formatter_benchmarks({ ...report(), tsv_binary: { source: 'cargo' } }),
			/tsv_binary/
		);
	});

	test('carries the rows the harness could not give a bin shim', () => {
		const parsed = parse_formatter_benchmarks(
			report({ scenarios: [scenario({ unshimmed: ['tsv-npm'] })] })
		);
		assert.deepEqual(parsed.scenarios[0]!.unshimmed, ['tsv-npm']);
		assert.notProperty(parse_formatter_benchmarks(report()).scenarios[0], 'unshimmed');
	});

	test('keeps a scenario the harness aborted before timing, with its reason and no numbers', () => {
		const aborted = untimed({
			id: 'svelte',
			name: 'Svelte',
			// the harness records the counts up front, so an abort keeps them
			warmup_runs: 3,
			benchmark_runs: 10,
			preflight: [preflight('rsvelte-fmt', { crashed: true }), preflight('tsv')],
			aborted: 'crashed: rsvelte-fmt'
		});
		const parsed = parse_formatter_benchmarks(report({ scenarios: [scenario(), aborted] }));
		assert.deepEqual(parsed.scenarios[1], aborted);
		assert.notProperty(parsed.scenarios[1], 'fastest');
	});

	test('keeps a scenario aborted in its memory pass, with its timings', () => {
		const aborted = scenario({ aborted: 'oxfmt crashed in 1 of 20 memory runs', memory: [] });
		const parsed = parse_formatter_benchmarks(report({ scenarios: [aborted] }));
		assert.lengthOf(parsed.scenarios[0]!.timings, 2);
		assert.isEmpty(parsed.scenarios[0]!.memory);
	});

	test('drops an aborted scenario tsv was not in', () => {
		const { fastest: _, ...aborted } = jsx_scenario({
			aborted: 'a timed run failed — Hyperfine failed with code 1',
			timings: [],
			speedups: []
		});
		const parsed = parse_formatter_benchmarks(report({ scenarios: [scenario(), aborted] }));
		assert.deepEqual(
			parsed.scenarios.map((s) => s.id),
			['large-single-file']
		);
	});

	test('throws on a key the schema does not know, naming where', () => {
		const drifted = { ...report(), scenarios: [{ ...scenario(), median_ms: 1 }] };
		assert.throws(() => parse_formatter_benchmarks(drifted), /median_ms/);
		assert.throws(() => parse_formatter_benchmarks({ ...report(), machine: undefined }), /machine/);
	});

	test('throws on a measurement that cannot be one', () => {
		const zero = report({ scenarios: [scenario({ timings: [timing('tsv', 0)] })] });
		assert.throws(() => parse_formatter_benchmarks(zero), /mean_ms/);
	});

	test('throws when a scenario carries neither timings nor an abort', () => {
		const empty = untimed();
		assert.throws(
			() => parse_formatter_benchmarks(report({ scenarios: [scenario(), empty] })),
			/has no timings/
		);
	});

	test('throws when `fastest` disagrees with whether anything was timed', () => {
		const unnamed = { ...scenario(), fastest: undefined };
		assert.throws(
			() => parse_formatter_benchmarks(report({ scenarios: [unnamed] })),
			/has 2 timings but fastest undefined/
		);
		const named = { ...untimed({ aborted: 'crashed: oxfmt' }), fastest: 'tsv' };
		assert.throws(
			() => parse_formatter_benchmarks(report({ scenarios: [scenario(), named] })),
			/has 0 timings but fastest "tsv"/
		);
		// the schema, before that check: a named-but-empty row is no row
		const blank = { ...untimed({ aborted: 'crashed: oxfmt' }), fastest: '' };
		assert.throws(
			() => parse_formatter_benchmarks(report({ scenarios: [scenario(), blank] })),
			/fastest/
		);
	});

	test('throws when no scenario timed tsv', () => {
		assert.throws(
			() => parse_formatter_benchmarks(report({ scenarios: [jsx_scenario()] })),
			/no scenario includes a tsv row \(found js-ts-no-embedded\)/
		);
	});

	test('throws when the tsv version is missing', () => {
		assert.throws(
			() => parse_formatter_benchmarks(report({ versions: { prettier: '3.9.6' } })),
			/no tsv version/
		);
	});
});

describe('the committed report', () => {
	test('validates, and round-trips unchanged', () => {
		// the generator writes `parse_formatter_benchmarks`'s output, so the committed
		// JSON must be a fixed point of it — a schema change that the committed report
		// no longer satisfies, or would re-serialize differently, shows up here
		// rather than as a surprise diff on the next `gro gen`
		const parsed = parse_formatter_benchmarks(benchmarks_formatters_json);
		assert.strictEqual(
			JSON.stringify(parsed, null, '\t'),
			JSON.stringify(benchmarks_formatters_json, null, '\t')
		);
	});
});
