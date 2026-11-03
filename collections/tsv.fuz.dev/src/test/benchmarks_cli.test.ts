import { assert, describe, test } from 'vitest';

import {
	cli_comparison_results,
	cli_default_anchor_label,
	cli_label_is_tsv,
	cli_memory_ratio_range,
	cli_ratio_between,
	cli_tsv_npm_overhead_ms_range,
	CLI_TSV_LABEL,
	CLI_TSV_NPM_LABEL,
	CLI_TSV_WASM_LABEL,
	to_abort_note,
	to_cli_scenarios,
	to_unshimmed_note,
	CLI_SVELTE_KEY,
	type CliFormatterResult,
	type CliScenario
} from '#routes/docs/benchmarks/benchmarks_cli.ts';
import type { FormatterScenario } from '#routes/docs/benchmarks/formatter_benchmark_data.ts';

import {
	create_formatter_preflight,
	create_formatter_scenario,
	create_formatter_timing,
	create_untimed_formatter_scenario
} from './benchmark_test_helpers.ts';

describe('to_abort_note', () => {
	// aborted before timing, until a test gives it rows
	const scenario = (overrides: Partial<FormatterScenario>): FormatterScenario =>
		create_untimed_formatter_scenario({
			preflight: [],
			aborted: 'harness said so',
			...overrides
		});
	const preflight = create_formatter_preflight;
	const timing = create_formatter_timing('tsv', 1);

	test('a preflight abort names each fault, with display labels', () => {
		assert.strictEqual(
			to_abort_note(
				scenario({
					preflight: [
						preflight('tsv', {}),
						preflight('rsvelte-fmt', { crashed: true }),
						preflight('tsv-npm', { unavailable: true }),
						preflight('biome', { rejected: 3 })
					]
				})
			),
			'Not timed: rsvelte-fmt crashed partway through its preflight check; tsv via Node dispatcher could not run; biome rejected 3 files.'
		);
	});

	test('a single rejected file reads in the singular', () => {
		assert.strictEqual(
			to_abort_note(scenario({ preflight: [preflight('biome', { rejected: 1 })] })),
			'Not timed: biome rejected 1 file.'
		);
	});

	test("the crash context follows only its own formatter's preflight crash", () => {
		const crash_context = { name: 'rsvelte-fmt', note: 'It does that.' };
		assert.strictEqual(
			to_abort_note(
				scenario({ preflight: [preflight('rsvelte-fmt', { crashed: true })] }),
				crash_context
			),
			'Not timed: rsvelte-fmt crashed partway through its preflight check. It does that.'
		);
		// another formatter's crash, a rejection, and an abort after timing are other causes
		for (const other of [
			scenario({ preflight: [preflight('tsv', { crashed: true })] }),
			scenario({ preflight: [preflight('rsvelte-fmt', { rejected: 2 })] }),
			scenario({ timings: [timing], preflight: [preflight('rsvelte-fmt', { crashed: true })] })
		]) {
			assert.notInclude(to_abort_note(other, crash_context), crash_context.note);
		}
	});

	test('a preflight abort with every row clean keeps the harness wording', () => {
		assert.strictEqual(
			to_abort_note(scenario({ preflight: [preflight('tsv', {})] })),
			'Not timed: harness said so.'
		);
	});

	test('an abort after timing reports only the missing memory, whatever preflight said', () => {
		assert.strictEqual(
			to_abort_note(
				scenario({
					timings: [timing],
					preflight: [preflight('biome', { rejected: 1 })]
				})
			),
			'Timed, but no memory was published: harness said so.'
		);
	});
});

describe('to_cli_scenarios', () => {
	test('a scenario aborted before timing keeps its roster and its abort, with no rows', () => {
		// the harness publishes the Svelte head-to-head aborted if rsvelte-fmt
		// crashes in preflight, the shape it has shipped in before
		const aborted = create_untimed_formatter_scenario({
			id: CLI_SVELTE_KEY,
			preflight: [
				create_formatter_preflight('rsvelte-fmt', { crashed: true }),
				create_formatter_preflight('tsv-npm'),
				create_formatter_preflight('tsv')
			],
			aborted: 'crashed: rsvelte-fmt'
		});
		const [svelte] = to_cli_scenarios({ scenarios: [aborted] });
		assert.ok(svelte);
		assert.deepEqual(svelte.labels, ['rsvelte-fmt', CLI_TSV_NPM_LABEL, CLI_TSV_LABEL]);
		assert.isEmpty(svelte.results);
		// the fault read off the rows, then the scenario's own context for that crash
		assert.match(
			svelte.aborted ?? '',
			/^Not timed: rsvelte-fmt crashed partway through its preflight check\. rsvelte-fmt 0\.7\.x can abort /
		);
		assert.isUndefined(cli_default_anchor_label(svelte));
	});

	test('a timed scenario lists each formatter once, and skips one without copy', () => {
		const timed = create_formatter_scenario();
		const uncopied = create_formatter_scenario({ id: 'no-copy-for-this' });
		const scenarios = to_cli_scenarios({ scenarios: [uncopied, timed] });
		assert.deepEqual(
			scenarios.map((s) => s.key),
			[timed.id]
		);
		assert.deepEqual(scenarios[0]!.labels, ['oxfmt', CLI_TSV_LABEL]);
	});
});

describe('cli ratios over a scenario with two tsv rows', () => {
	const result = (
		label: string,
		wall_ms: number,
		memory_mb: number | null
	): CliFormatterResult => ({
		label,
		wall_ms,
		cpu_ms: wall_ms,
		memory_mb
	});
	const results = [
		result('tsv', 20, 10),
		result(CLI_TSV_NPM_LABEL, 50, 40),
		result('oxfmt', 60, 100),
		result('biome', 100, null)
	];

	test('a dispatcher row beside other tools is not one of them', () => {
		assert.deepEqual(
			cli_comparison_results({ results, tsv_only: false }).map((r) => r.label),
			['oxfmt', 'biome']
		);
	});

	test('a tsv distribution the harness adds later is still tsv, by prefix', () => {
		// a closed label set would admit a new `tsv-*` row as a competitor, and the
		// "less memory than every other tool" ranges would quietly span it
		for (const label of [CLI_TSV_LABEL, CLI_TSV_NPM_LABEL, CLI_TSV_WASM_LABEL, 'tsv-bun']) {
			assert.isTrue(cli_label_is_tsv(label), label);
		}
		for (const label of ['oxfmt', 'biome', 'rsvelte-fmt', 'tsvelte', 'prettier + oxc-parser']) {
			assert.isFalse(cli_label_is_tsv(label), label);
		}
		assert.deepEqual(
			cli_comparison_results({
				results: [...results, result('tsv-bun', 30, 20)],
				tsv_only: false
			}).map((r) => r.label),
			['oxfmt', 'biome']
		);
	});

	test('a tsv-only scenario compares native tsv with its own distributions', () => {
		const delivery = [result('tsv', 20, 10), results[1]!, result(CLI_TSV_WASM_LABEL, 160, 120)];
		assert.deepEqual(
			cli_comparison_results({ results: delivery, tsv_only: true }).map((r) => r.label),
			[CLI_TSV_NPM_LABEL, CLI_TSV_WASM_LABEL]
		);
	});

	test('ratios anchor on whichever tsv row is named', () => {
		assert.strictEqual(cli_ratio_between(results, 'oxfmt', CLI_TSV_LABEL, 'wall_ms'), 3);
		assert.strictEqual(cli_ratio_between(results, 'oxfmt', CLI_TSV_NPM_LABEL, 'wall_ms'), 1.2);
		assert.strictEqual(cli_ratio_between(results, 'oxfmt', CLI_TSV_NPM_LABEL, 'memory_mb'), 2.5);
	});

	test('a missing row or measurement has no ratio', () => {
		assert.isUndefined(cli_ratio_between(results, 'prettier', CLI_TSV_NPM_LABEL, 'wall_ms'));
		assert.isUndefined(cli_ratio_between(results, 'biome', CLI_TSV_NPM_LABEL, 'memory_mb'));
		// the baseline row itself missing
		const without_npm = results.filter((r) => r.label !== CLI_TSV_NPM_LABEL);
		assert.isUndefined(cli_ratio_between(without_npm, 'oxfmt', CLI_TSV_NPM_LABEL, 'wall_ms'));
	});
});

describe('cli_default_anchor_label', () => {
	const row = (label: string) => ({ label, wall_ms: 1, cpu_ms: 1, memory_mb: 1 });

	test('facing other tools, the dispatcher row is the like-for-like anchor', () => {
		const results = [row('oxfmt'), row(CLI_TSV_NPM_LABEL), row(CLI_TSV_LABEL)];
		assert.strictEqual(cli_default_anchor_label({ results, tsv_only: false }), CLI_TSV_NPM_LABEL);
	});

	test('a tsv-only scenario anchors on the native binary its rows are distributions of', () => {
		const results = [row(CLI_TSV_WASM_LABEL), row(CLI_TSV_NPM_LABEL), row(CLI_TSV_LABEL)];
		assert.strictEqual(cli_default_anchor_label({ results, tsv_only: true }), CLI_TSV_LABEL);
	});

	test('without a dispatcher row it falls back to native tsv, and without tsv to nothing', () => {
		assert.strictEqual(
			cli_default_anchor_label({ results: [row('oxfmt'), row(CLI_TSV_LABEL)], tsv_only: false }),
			CLI_TSV_LABEL
		);
		assert.isUndefined(cli_default_anchor_label({ results: [], tsv_only: false }));
	});
});

describe('cli claims spanning scenarios', () => {
	const result = (
		label: string,
		wall_ms: number,
		memory_mb: number | null
	): CliFormatterResult => ({ label, wall_ms, cpu_ms: wall_ms, memory_mb });
	const scenario = (key: string, overrides: Partial<CliScenario> = {}): CliScenario => ({
		key,
		heading: key,
		description: '',
		tsv_only: false,
		target: '',
		corpus: '',
		labels: overrides.results?.map((r) => r.label) ?? [],
		results: [],
		warmup_runs: 3,
		benchmark_runs: 20,
		...overrides
	});
	const facing = scenario('facing', {
		results: [
			result(CLI_TSV_LABEL, 20, 10),
			result(CLI_TSV_NPM_LABEL, 50, 40),
			result('oxfmt', 60, 100),
			result('biome', 100, null)
		]
	});
	const delivery = scenario('delivery', {
		tsv_only: true,
		results: [
			result(CLI_TSV_LABEL, 10, 10),
			result(CLI_TSV_NPM_LABEL, 45, 60),
			result(CLI_TSV_WASM_LABEL, 90, 80)
		]
	});

	test('the dispatcher overhead spans every scenario that timed both rows', () => {
		assert.deepEqual(cli_tsv_npm_overhead_ms_range([facing, delivery]), { min: 30, max: 35 });
		assert.isUndefined(
			cli_tsv_npm_overhead_ms_range([scenario('s', { results: [result(CLI_TSV_LABEL, 20, 10)] })])
		);
	});

	test('an unnamed tool without a memory figure is skipped, a named one voids the range', () => {
		// biome measured no memory, so only oxfmt's 100 / 10 remains
		assert.deepEqual(cli_memory_ratio_range({}, [facing, delivery]), { min: 10, max: 10 });
		assert.isUndefined(cli_memory_ratio_range({ labels: ['oxfmt', 'biome'] }, [facing]));
		assert.isUndefined(cli_memory_ratio_range({ labels: ['oxfmt', 'renamed'] }, [facing]));
	});

	test('a scenario without the baseline row voids the range rather than narrowing it', () => {
		const no_baseline = scenario('s', { results: [result('oxfmt', 60, 100)] });
		assert.isUndefined(cli_memory_ratio_range({}, [facing, no_baseline]));
		// the row is there but its memory pass measured nothing
		const no_figure = scenario('s', {
			results: [result(CLI_TSV_LABEL, 20, null), result('oxfmt', 60, 100)]
		});
		assert.isUndefined(cli_memory_ratio_range({}, [facing, no_figure]));
	});

	test('a scenario that published no memory is skipped unscoped', () => {
		// timed, then aborted in its memory pass: rows with no figure at all
		const memory_aborted = scenario('s', {
			results: [result(CLI_TSV_LABEL, 20, null), result('oxfmt', 60, null)]
		});
		const untimed = scenario('u', { results: [] });
		assert.deepEqual(cli_memory_ratio_range({}, [facing, memory_aborted, untimed]), {
			min: 10,
			max: 10
		});
		assert.isUndefined(cli_memory_ratio_range({}, [memory_aborted]));
		// named, it voids rather than skips
		assert.isUndefined(cli_memory_ratio_range({ scenario_key: 's' }, [facing, memory_aborted]));
	});

	test('a tsv-only scenario is spanned only by name', () => {
		assert.deepEqual(cli_memory_ratio_range({ scenario_key: 'delivery' }, [facing, delivery]), {
			min: 6,
			max: 8
		});
	});
});

describe('to_unshimmed_note', () => {
	test('names the rows by their display labels', () => {
		assert.strictEqual(
			to_unshimmed_note(['tsv-npm', 'tsv-wasm']),
			'tsv via Node dispatcher and tsv-wasm ran as a bare Node script, skipping the few milliseconds of pnpm bin shim the other tools’ rows go through.'
		);
	});
});
