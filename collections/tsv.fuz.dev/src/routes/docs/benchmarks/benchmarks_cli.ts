// The independent end-to-end CLI benchmark — a fork of Oxc's own
// `bench-formatter` that adds tsv (https://github.com/ryanatkn/oxc-bench-formatter,
// forked from https://github.com/oxc-project/bench-formatter — `tsv` is the fork's
// DEFAULT branch, so the bare fork URL already lands on it; upstream carries
// neither tsv nor this analysis). Unlike the in-process, single-threaded numbers
// elsewhere on this page, it measures the WHOLE CLI: process spawn, file
// discovery, I/O, and each tool's default multi-file parallelism. tsv, oxfmt, biome,
// and rsvelte-fmt parallelize across files while prettier formats them one at a time, so
// the wall-clock ratios scale with core count and are machine-dependent — the
// parallelism-neutral view is CPU work (hyperfine's `User` + `System` time). tsv runs only in
// the JSX-free scenarios (it has no JSX/TSX parser); the Svelte scenario benches
// it against rsvelte-fmt (`@rsvelte/fmt`), another Rust Svelte-native formatter,
// and the delivery scenario benches tsv against itself — the native binary, the
// same binary through `@fuzdev/tsv`'s Node dispatcher, and `@fuzdev/tsv-wasm`.
//
// The numbers come from `benchmarks_formatters.json`, generated from that
// harness's `results.json` by `benchmarks_formatters.gen.json.ts`; only the prose below
// is authored here. To refresh: run `pnpm run update-readme` in the harness, then
// `gro gen` here.

import { plural } from '@fuzdev/fuz_util/string.ts';

import { benchmarks_formatters_json } from './benchmarks_formatters.ts';
import type { FormatterBenchmarks, FormatterScenario } from './formatter_benchmark_data.ts';

export interface CliFormatterResult {
	/** Display label — the name a table's ratios are anchored by (see `cli_default_anchor_label`). */
	label: string;
	/** hyperfine wall-clock mean, in milliseconds — what you experience typing the command. */
	wall_ms: number;
	/**
	 * Total CPU time across all threads, in ms — hyperfine's `User` plus `System`,
	 * the parallelism-neutral view. System time is counted because it is real work
	 * the command demanded (file I/O, thread spawn, page faults), and its share
	 * differs sharply per tool.
	 */
	cpu_ms: number;
	/** Peak resident set size (RSS), in MiB; `null` when the harness measured no memory. */
	memory_mb: number | null;
}

/** A measured `CliFormatterResult` column — what a ratio can be taken over. */
export type CliMetric = keyof Omit<CliFormatterResult, 'label'>;

/** The authored half of a scenario — what `SCENARIO_COPY` holds; the rest is generated. */
export interface CliScenarioCopy {
	heading: string;
	/** One-line description of what makes the comparison fair. */
	description: string;
	/**
	 * Context for one formatter's known preflight crash, appended to the abort note
	 * only when that formatter's check is what crashed — any other abort has a
	 * different cause, which the note must not attribute to this one.
	 */
	crash_context?: { /** The formatter, as the harness names it. */ name: string; note: string };
	/**
	 * Every row is a tsv distribution, so the scenario compares tsv with itself and
	 * says nothing about other tools — claims spanning "every other tool" skip it.
	 */
	tsv_only: boolean;
}

export interface CliScenario extends CliScenarioCopy {
	key: string;
	/** The harness's own one-line corpus label, rendered beside the heading. */
	target: string;
	/** Which revision of the corpus the numbers came from, as the harness records it. */
	corpus: string;
	/** How many files the scenario formatted, when the harness recorded it. */
	files?: number;
	/**
	 * Every formatter the scenario benched, as displayed, in the harness's order —
	 * timed or only preflight-checked. An abort before timing empties `results`
	 * but not this, so it's what says who the scenario is between.
	 */
	labels: Array<string>;
	/**
	 * Results ascending by wall-clock time. The component computes each ratio
	 * against its table's anchor row — the dispatcher row facing other tools, native
	 * tsv in the tsv-only table, or whichever row is hovered.
	 */
	results: Array<CliFormatterResult>;
	/**
	 * hyperfine's untimed warmup runs and the timed runs each mean is taken over.
	 * The harness sets them per scenario (more for the short one-file runs), so
	 * they're shown per table. A scenario aborted before timing still carries the
	 * counts it would have run, so they say nothing about whether it was timed.
	 */
	warmup_runs: number;
	benchmark_runs: number;
	/**
	 * Why the harness stopped early, when it did. Before timing, `results` is
	 * empty and the sentence names the formatter its preflight faulted; after
	 * timing (a memory run crashed) `results` carry times but no memory. Either
	 * way the scenario is kept, so the gap reads as a reported abort rather than a
	 * silently missing table.
	 */
	aborted?: string;
	/**
	 * Why a tsv row's launch cost isn't like-for-like, when it isn't: the harness
	 * normally runs tsv's Node-launched rows through a bin shim derived from pnpm's
	 * own, as every other tool's row runs, and says so when it couldn't.
	 */
	unshimmed?: string;
}

/**
 * The harness report as the page reads it: its run-level fields as the schema
 * documents them, and the scenarios shaped for the tables.
 */
export interface BenchmarksCliReport extends Omit<FormatterBenchmarks, 'scenarios'> {
	scenarios: Array<CliScenario>;
}

/**
 * The native tsv row: the bare binary, what `cli_ratio_vs_tsv` and the
 * tsv-only delivery table take their ratios against.
 */
export const CLI_TSV_LABEL = 'tsv';

/**
 * The tsv-vs-rsvelte-fmt Svelte scenario's id. The harness publishes it aborted
 * if rsvelte-fmt crashes, which it has done in preflight, so prose quoting its
 * ratios must be conditional on them resolving.
 */
export const CLI_SVELTE_KEY = 'svelte-tsv-vs-rsvelte-fmt';

/** The multi-file TypeScript repo scenario's id — what the page's prose calls "the TypeScript repo". */
export const CLI_TS_REPO_KEY = 'typescript-only-non-jsx-subset';

/** The one-file scenario's id — what the page's prose calls "the large single file". */
export const CLI_SINGLE_FILE_KEY = 'large-single-file';

/**
 * The tsv-only delivery scenario's id: the native binary against the same binary
 * through `@fuzdev/tsv`'s Node dispatcher and against `@fuzdev/tsv-wasm`, on one
 * file. It measures what each way of installing tsv costs, not another tool.
 */
export const CLI_DELIVERY_KEY = 'tsv-delivery-paths';

/**
 * The npm-dispatcher row, as displayed: the native binary reached through
 * `@fuzdev/tsv`'s Node bin. It runs in the delivery scenario and beside native
 * tsv wherever the harness benches it against the other tools' npm bins.
 */
export const CLI_TSV_NPM_LABEL = 'tsv via Node dispatcher';

/** The delivery scenario's wasm row, as displayed. */
export const CLI_TSV_WASM_LABEL = 'tsv-wasm';

/**
 * Whether a row is tsv itself — the native binary or one of its other
 * distributions. By prefix rather than a closed set, so a distribution row the
 * harness adds later (another binding, another launcher) is still tsv and never
 * slips into the "every other tool" ranges as a competitor: the harness names its
 * tsv rows `tsv`, `tsv-npm`, `tsv-wasm`, and the display labels keep that prefix.
 */
export const cli_label_is_tsv = (label: string): boolean =>
	label === CLI_TSV_LABEL ||
	label.startsWith(`${CLI_TSV_LABEL}-`) ||
	label.startsWith(`${CLI_TSV_LABEL} `);

/**
 * The prose framing for each scenario, keyed by its generated scenario id — the
 * harness measures the numbers but doesn't explain them. Also fixes the page
 * order, which is by narrative weight (the multi-file repo leads, the tsv-only
 * delivery comparison closes), not the order the harness runs them in. A
 * scenario missing from here is dropped rather than rendered unexplained.
 */
const SCENARIO_COPY: Record<string, CliScenarioCopy> = {
	[CLI_TS_REPO_KEY]: {
		heading: 'TypeScript repo',
		description:
			'Every formatter scoped to the same JSX-free files, each at its default parallelism.',
		tsv_only: false
	},
	[CLI_SINGLE_FILE_KEY]: {
		heading: 'Large single file',
		description:
			'With one input, no formatter can parallelize across files, so wall-clock time comes nearer to engine speed plus startup. Startup is each tool’s own process and thread-pool setup, plus Node’s for every row but the bare tsv binary: a fixed cost that weighs most on the fastest rows.',
		tsv_only: false
	},
	[CLI_SVELTE_KEY]: {
		heading: 'Svelte corpus',
		description:
			'Two Rust-native Svelte formatters head-to-head. rsvelte-fmt’s time includes the Oxfmt it launches for the file types it doesn’t format itself, which walks the corpus and finds none.',
		crash_context: {
			name: 'rsvelte-fmt',
			note: 'rsvelte-fmt 0.7.x can abort when its stdout and stderr share a pipe, and the harness doesn’t retry.'
		},
		tsv_only: false
	},
	[CLI_DELIVERY_KEY]: {
		heading: 'tsv delivery paths',
		description:
			'Every row is tsv, delivered three ways: the native binary; the same binary through @fuzdev/tsv’s Node dispatcher; and @fuzdev/tsv-wasm, tsv’s CLI reimplemented in JS over a wasm engine, the package for platforms without a prebuilt binary. The corpus is one file, so the gaps are launch and engine cost, not file parallelism. In time, tsv-wasm still finishes well ahead of both Prettier rows in the single-file table, but behind Oxfmt and Biome.',
		tsv_only: true
	}
};

/**
 * Display labels for the harness's hyperfine command names, which read better
 * spaced out in a table. Names absent here are displayed as-is.
 */
const CLI_LABELS: Record<string, string> = {
	'prettier+oxc-parser': 'prettier + oxc-parser',
	'tsv-npm': CLI_TSV_NPM_LABEL
};

const to_label = (name: string): string => CLI_LABELS[name] ?? name;

const to_labels = (scenario: FormatterScenario): Array<string> => [
	...new Set([...scenario.preflight, ...scenario.timings].map((entry) => to_label(entry.name)))
];

const to_results = (scenario: FormatterScenario): Array<CliFormatterResult> =>
	scenario.timings
		.map((timing) => ({
			label: to_label(timing.name),
			wall_ms: timing.mean_ms,
			cpu_ms: timing.user_ms + timing.system_ms,
			memory_mb: scenario.memory.find((m) => m.name === timing.name)?.mean_mb ?? null
		}))
		.sort((a, b) => a.wall_ms - b.wall_ms);

/**
 * The scenarios the page has prose for; every one must resolve to generated
 * data, timed or aborted — the harness publishes an aborted scenario too.
 */
export const CLI_SCENARIO_KEYS = Object.keys(SCENARIO_COPY);

/**
 * The sentence an aborted scenario shows beside (or in place of) its table. An
 * abort after timing (a memory run that crashed) keeps its timed rows, so the
 * note says only what is missing. A preflight abort names the fault per
 * formatter in its rows and then only says it is aborting, so the cause is read
 * back off those rows; one with every row clean — a scope mismatch, say — keeps
 * the harness's own wording. A scenario's `crash_context` follows only when the
 * formatter it names is one whose check crashed.
 */
export const to_abort_note = (
	scenario: FormatterScenario,
	crash_context?: CliScenarioCopy['crash_context']
): string => {
	if (scenario.timings.length) return `Timed, but no memory was published: ${scenario.aborted}.`;
	const context = scenario.preflight.some((e) => e.crashed && e.name === crash_context?.name)
		? ` ${crash_context?.note}`
		: '';
	const faults = scenario.preflight.flatMap((entry) => {
		const label = to_label(entry.name);
		if (entry.crashed) return [`${label} crashed partway through its preflight check`];
		if (entry.unavailable) return [`${label} could not run`];
		if (entry.rejected > 0)
			return [`${label} rejected ${entry.rejected} file${plural(entry.rejected)}`];
		return [];
	});
	return `Not timed: ${faults.length ? faults.join('; ') : scenario.aborted}.${context}`;
};

/**
 * The sentence a scenario shows when the harness ran some tsv rows without the
 * bin shim the other rows pay for.
 */
export const to_unshimmed_note = (names: Array<string>): string =>
	`${names.map(to_label).join(' and ')} ran as a bare Node script, skipping the few milliseconds of pnpm bin shim the other tools’ rows go through.`;

/**
 * A report's scenarios shaped for the tables, in `SCENARIO_COPY`'s order — the
 * ones it has copy for, timed or aborted.
 *
 * @param report - the validated formatter report
 * @returns the scenarios the page renders
 */
export const to_cli_scenarios = (
	report: Pick<FormatterBenchmarks, 'scenarios'>
): Array<CliScenario> =>
	Object.entries(SCENARIO_COPY).flatMap(([key, copy]) => {
		const scenario = report.scenarios.find((s) => s.id === key);
		return scenario
			? [
					{
						key,
						...copy,
						target: scenario.target,
						corpus: scenario.corpus,
						...(scenario.files === undefined ? null : { files: scenario.files }),
						labels: to_labels(scenario),
						results: to_results(scenario),
						warmup_runs: scenario.warmup_runs,
						benchmark_runs: scenario.benchmark_runs,

						...(scenario.aborted === undefined
							? null
							: { aborted: to_abort_note(scenario, copy.crash_context) }),
						...(scenario.unshimmed ? { unshimmed: to_unshimmed_note(scenario.unshimmed) } : null)
					}
				]
			: [];
	});

export const benchmarks_cli: BenchmarksCliReport = {
	...benchmarks_formatters_json,
	scenarios: to_cli_scenarios(benchmarks_formatters_json)
};

/**
 * The machine's bare Node launch, in milliseconds — what the prose quotes as the
 * floor under every npm-bin row.
 *
 * @returns the mean of the report's `node -e ""` runs
 */
export const cli_node_startup_ms = (): number => benchmarks_cli.node_startup.mean_ms;

/**
 * One rendered CLI scenario by its id — for prose that needs more than a ratio,
 * such as whether the scenario was aborted.
 *
 * @returns the scenario, or `undefined` when the generated data doesn't carry it
 */
export const cli_scenario_find = (scenario_key: string): CliScenario | undefined =>
	benchmarks_cli.scenarios.find((s) => s.key === scenario_key);

const cli_ratio_vs = (
	scenario_key: string,
	label: string,
	baseline_label: string,
	metric: CliMetric
): number | undefined => {
	const results = cli_scenario_find(scenario_key)?.results;
	return results && cli_ratio_between(results, label, baseline_label, metric);
};

/**
 * `label`'s measurement over native tsv's in one CLI scenario, by the given
 * metric — the ratios the page's prose quotes: how many times faster or lighter
 * tsv is than another tool, or what a tsv distribution costs over the bare binary.
 *
 * @returns the ratio, or `undefined` when the scenario, the formatter, or either
 * side's measurement is absent
 */
export const cli_ratio_vs_tsv = (
	scenario_key: string,
	label: string,
	metric: CliMetric
): number | undefined => cli_ratio_vs(scenario_key, label, CLI_TSV_LABEL, metric);

/**
 * `label`'s measurement over tsv's Node dispatcher row in one CLI scenario — how
 * many times faster or lighter tsv is than `label` like for like, since the other
 * tools are timed through their npm bins too.
 *
 * @returns the ratio, or `undefined` when the scenario, either row, or either
 * side's measurement is absent — an aborted scenario has none
 */
export const cli_ratio_vs_tsv_npm = (
	scenario_key: string,
	label: string,
	metric: CliMetric
): number | undefined => cli_ratio_vs(scenario_key, label, CLI_TSV_NPM_LABEL, metric);

/**
 * What the Node dispatcher adds over the bare binary in wall-clock, in
 * milliseconds, spanned across every scenario that times both rows — Node
 * starting up to launch the binary, which the page calls a fixed cost.
 *
 * @param scenarios - the scenarios to read, the rendered ones by default
 * @returns the low and high difference, or `undefined` when no scenario timed both rows
 */
export const cli_tsv_npm_overhead_ms_range = (
	scenarios: Array<CliScenario> = benchmarks_cli.scenarios
): { min: number; max: number } | undefined => {
	const overheads = scenarios.flatMap((s) => {
		const npm = s.results.find((r) => r.label === CLI_TSV_NPM_LABEL);
		const tsv = s.results.find((r) => r.label === CLI_TSV_LABEL);
		return npm && tsv ? [npm.wall_ms - tsv.wall_ms] : [];
	});
	if (overheads.length === 0) return undefined;
	return { min: Math.min(...overheads), max: Math.max(...overheads) };
};

/**
 * `label`'s measurement over `baseline_label`'s, by one metric, within a
 * scenario's rows.
 *
 * @returns the ratio, or `undefined` when either row or either side's measurement is
 * absent (a `null` memory figure, or a zero that can't be divided by)
 */
export const cli_ratio_between = (
	results: Array<CliFormatterResult>,
	label: string,
	baseline_label: string,
	metric: CliMetric
): number | undefined => {
	const baseline = results.find((r) => r.label === baseline_label)?.[metric];
	const other = results.find((r) => r.label === label)?.[metric];
	if (!baseline || other == null) return undefined;
	return other / baseline;
};

/**
 * The row a scenario's table takes its ratios against until a reader hovers
 * another one. Facing other tools that is the dispatcher row, the like-for-like
 * footing the page's headline claims lead with; a tsv-only scenario anchors on
 * the native binary, which its other rows are distributions of.
 *
 * @returns the anchor row's label, or `undefined` when the scenario has no tsv
 * row to anchor on — an abort before timing
 */
export const cli_default_anchor_label = (
	scenario: Pick<CliScenario, 'results' | 'tsv_only'>
): string | undefined => {
	const has = (label: string) => scenario.results.some((r) => r.label === label);
	if (!scenario.tsv_only && has(CLI_TSV_NPM_LABEL)) return CLI_TSV_NPM_LABEL;
	return has(CLI_TSV_LABEL) ? CLI_TSV_LABEL : undefined;
};

/**
 * The rows of a scenario a claim about tsv is measured against. Facing other
 * tools, that is the other tools only — a dispatcher row beside them is tsv
 * again, not a competitor. In a tsv-only scenario it is every row but native tsv.
 */
export const cli_comparison_results = (
	scenario: Pick<CliScenario, 'results' | 'tsv_only'>
): Array<CliFormatterResult> =>
	scenario.results.filter((r) =>
		scenario.tsv_only ? r.label !== CLI_TSV_LABEL : !cli_label_is_tsv(r.label)
	);

/**
 * Whether a scenario published any memory figure. One aborted in its memory pass
 * keeps its timed rows and carries none, and one aborted before timing has no rows.
 */
export const cli_scenario_has_memory = (scenario: Pick<CliScenario, 'results'>): boolean =>
	scenario.results.some((r) => r.memory_mb != null);

/**
 * The span of "times less memory than tsv" across `cli_comparison_results`, over one
 * scenario or every scenario that faces other tools — the range a memory claim
 * rests on. Unscoped, it skips the tsv-only scenarios, whose rows are
 * tsv's own distributions rather than "every other tool"; name one explicitly to
 * span it. Unscoped and unnamed it also skips a scenario that published no memory
 * at all (an abort). An optional `labels` list narrows the span to just those formatters,
 * so a sentence naming specific tools quotes a range measured over exactly them
 * — every named tool must resolve in every spanned scenario, or the range is
 * `undefined` rather than quietly narrower than the sentence claims — and
 * `baseline_label` takes the ratios against the dispatcher row instead of the
 * bare binary.
 *
 * @param scenarios - the scenarios to read, the rendered ones by default
 * @returns the low and high ratio, or `undefined` when nothing was measured, or
 * when a named tool or the baseline's figure is missing from a spanned scenario
 */
export const cli_memory_ratio_range = (
	options: { scenario_key?: string; labels?: Array<string>; baseline_label?: string } = {},
	scenarios: Array<CliScenario> = benchmarks_cli.scenarios
): { min: number; max: number } | undefined => {
	const { scenario_key, labels, baseline_label = CLI_TSV_LABEL } = options;
	const spanned = scenarios.filter((s) => (scenario_key ? s.key === scenario_key : !s.tsv_only));
	const ratios: Array<number> = [];
	for (const scenario of spanned) {
		if (!scenario_key && !labels && !cli_scenario_has_memory(scenario)) continue;
		const compared = cli_comparison_results(scenario).filter(
			(r) => !labels || labels.includes(r.label)
		);
		if (labels && compared.length !== labels.length) return undefined;
		for (const r of compared) {
			const ratio = cli_ratio_between(scenario.results, r.label, baseline_label, 'memory_mb');
			if (ratio === undefined) {
				// a named tool without a figure, or a scenario without the baseline's,
				// would silently narrow the span the sentence claims
				const baseline = scenario.results.find((s) => s.label === baseline_label);
				if (labels || baseline?.memory_mb == null) return undefined;
				continue;
			}
			ratios.push(ratio);
		}
	}
	if (ratios.length === 0) return undefined;
	return { min: Math.min(...ratios), max: Math.max(...ratios) };
};
