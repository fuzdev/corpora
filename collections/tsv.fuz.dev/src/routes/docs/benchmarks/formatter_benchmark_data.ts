// Schemas and validation for the formatter comparison benchmark — Prettier,
// Biome, Oxfmt, rsvelte-fmt, and tsv on shared corpora. The harness publishes its
// numbers as `results.json` beside its README: hyperfine's own export plus the
// memory pass and the preflight check, recorded by the functions that print them.
// This module validates that report and keeps the scenarios tsv runs in;
// `benchmarks_formatters.gen.json.ts` writes the result out.

import * as s from '@fuzdev/fuz_schema/schema.ts';

const NonEmptyString = s.pipe(s.string, s.min_length(1));
const Positive = s.pipe(
	s.number,
	s.check((v: number) => v > 0, '> 0')
);
const NonNegative = s.pipe(s.number, s.min_value(0));
// Zod's `int()` is a safe integer
const Count = s.pipe(s.number, s.safe_integer, s.min_value(0));
const PositiveCount = s.pipe(s.number, s.safe_integer, s.min_value(1));

// the pattern of Zod's `z.iso.datetime()`: a UTC `Z` time, seconds and their fraction optional
const DATETIME =
	/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z)$/;
const Datetime = s.pipe(s.string, s.regex(DATETIME, 'an ISO datetime'));

/** A single formatter's timing in one scenario. All durations in milliseconds. */
export const FormatterTiming = s.object({
	name: NonEmptyString,
	mean_ms: Positive,
	/** Zero for a lone run, which has no spread. */
	stddev_ms: NonNegative,
	user_ms: NonNegative,
	system_ms: NonNegative,
	min_ms: Positive,
	max_ms: Positive
});
export type FormatterTiming = s.Infer<typeof FormatterTiming>;

/**
 * A single formatter's peak-RSS measurement in one scenario. The harness's `_mb`
 * are GNU time's KiB over 1024 — MiB, which is how the page labels them.
 */
export const FormatterMemory = s.object({
	name: NonEmptyString,
	mean_mb: Positive,
	min_mb: Positive,
	max_mb: Positive,
	/**
	 * Ratio to the scenario's baseline formatter (tsv wherever tsv runs); absent on
	 * that row. Below 1 means less memory than the baseline.
	 */
	ratio: s.optional(Positive),
	ratio_stddev: s.optional(NonNegative)
});
export type FormatterMemory = s.Infer<typeof FormatterMemory>;

/** How a scenario's fastest formatter compares to one of the others. */
export const FormatterSpeedup = s.object({
	name: NonEmptyString,
	ratio: Positive,
	ratio_stddev: NonNegative
});
export type FormatterSpeedup = s.Infer<typeof FormatterSpeedup>;

/**
 * A formatter's parse-check result over the scenario's corpus. The harness runs
 * this before timing so a tool that rejects files isn't credited for skipping
 * them.
 */
export const FormatterPreflight = s.object({
	name: NonEmptyString,
	/** Files the formatter refused to parse. */
	rejected: Count,
	/** The formatter's binary never launched, so its timing row is meaningless. */
	unavailable: s.boolean,
	/** The check pass crashed partway (exit ≥ 128), so its coverage is unknown. */
	crashed: s.boolean
});
export type FormatterPreflight = s.Infer<typeof FormatterPreflight>;

/** One benchmark scenario — a corpus benched across every formatter that supports it. */
export const FormatterScenario = s.object({
	/** Slug of `name`, e.g. `large-single-file` — what the page keys its copy on. */
	id: NonEmptyString,
	name: NonEmptyString,
	/** The corpus, as the harness describes it. */
	target: NonEmptyString,
	/**
	 * Which revision of that corpus these numbers came from — a commit and date, or
	 * a size and content hash for a single downloaded file. It is how a published
	 * run says which pin of each corpus it ran at, so two runs can be told apart.
	 */
	corpus: NonEmptyString,
	/**
	 * The counts the scenario resolved, recorded before anything can abort it. 0 only
	 * in the harness's upstream scenarios when hyperfine itself failed.
	 */
	warmup_runs: Count,
	benchmark_runs: Count,
	/**
	 * Seconds the harness idled before each formatter's warmups, to even out the
	 * thermal drift its fixed command order creates. Absent from the scenarios that
	 * don't settle; `0` means a run that turned it off.
	 */
	settle_seconds: s.optional(NonNegative),
	/** One row per formatter the scenario checked before timing; empty where it ran no preflight. */
	preflight: s.array(FormatterPreflight),
	/**
	 * How many files the scenario formatted: the count every formatter that reports
	 * one agreed on in preflight. Absent where none reports one, and from reports
	 * that predate the field.
	 */
	files: s.optional(PositiveCount),
	/**
	 * Why the harness stopped early. Before timing (preflight failed) there are no
	 * timings, speedups, or memory rows and the `preflight` entries say which
	 * formatter caused it; after timing (a memory run crashed) timings and speedups
	 * are present and only `memory` is empty.
	 */
	aborted: s.optional(NonEmptyString),
	/**
	 * tsv's Node-launched rows that ran as `node <script>` because the harness had
	 * no pnpm bin shim to copy for them — so they skipped the few milliseconds of
	 * shell shim every other tool's row pays. Absent when every row was shimmed.
	 */
	unshimmed: s.optional(s.pipe(s.array(NonEmptyString), s.min_length(1))),
	timings: s.array(FormatterTiming),
	/**
	 * The fastest timed formatter, and its margin over each other one; absent when
	 * nothing was timed. Not the memory rows' anchor, which the harness fixes per
	 * scenario and marks by leaving that row without a `ratio`.
	 */
	fastest: s.optional(NonEmptyString),
	speedups: s.array(FormatterSpeedup),
	/** Empty without GNU time, and when an abort kept the memory pass from finishing. */
	memory: s.array(FormatterMemory)
});
export type FormatterScenario = s.Infer<typeof FormatterScenario>;

/**
 * The formatter comparison, as the harness publishes it and as this site commits
 * it. The committed copy holds only the scenarios tsv participates in — it has no
 * JSX/TSX parser, so the harness runs it on the JSX-free corpora only and the
 * other scenarios have no tsv row to compare against.
 */
export const FormatterBenchmarks = s.object({
	/** When the run started. */
	timestamp: Datetime,
	/** The harness revision that ran, abbreviated as `git rev-parse --short` prints it. */
	git_commit: NonEmptyString,
	/**
	 * Whether the harness tree had uncommitted changes when the run started — its
	 * numbers then came from code `git_commit` doesn't hold.
	 */
	git_dirty: s.boolean,
	/**
	 * The machine the numbers came from. The ratios move with it — Biome, Oxfmt,
	 * and tsv scale across cores while Prettier formats files one at a time. `arch`
	 * is `uname -m`'s naming (`x86_64`), as tsv's own reports write it.
	 */
	machine: s.object({
		cpu_model: NonEmptyString,
		threads: PositiveCount,
		os: NonEmptyString,
		arch: NonEmptyString
	}),
	/**
	 * A bare `node -e ""` timed under hyperfine on the same machine, with the PATH
	 * the scenarios resolve `node` from: the launch floor every npm-bin row pays
	 * before its formatter runs. A machine property beside `machine`, never a row,
	 * so it can't be folded into an "every other tool" range.
	 */
	node_startup: s.object({
		mean_ms: Positive,
		stddev_ms: NonNegative,
		runs: PositiveCount
	}),
	/**
	 * Formatter name to version string, e.g. `prettier` to `3.9.1`, plus `node` —
	 * not a formatter, but what every row except the bare `tsv` binary launches first.
	 */
	versions: s.record(NonEmptyString),
	/**
	 * Where the native tsv rows' binary came from: the platform package
	 * `@fuzdev/tsv` installs, or a local build through `TSV_BIN`, dated by its
	 * mtime (`null` when it couldn't be read).
	 */
	tsv_binary: s.variant('source', [
		s.object({ source: s.literal('package'), package: NonEmptyString }),
		s.object({ source: s.literal('TSV_BIN'), built: s.nullable(NonEmptyString) })
	]),
	scenarios: s.array(FormatterScenario)
});
export type FormatterBenchmarks = s.Infer<typeof FormatterBenchmarks>;

/**
 * Copies `value` with its keys in the order of `schema`'s entries. An `object`
 * schema returns its input as it is, and the harness writes some keys in an
 * order of its own, so this keeps the committed report in the schema's order
 * whatever order a run wrote.
 */
const in_schema_order = <T extends object>(schema: { def: object }, value: T): T => {
	const ordered: Record<string, unknown> = {};
	for (const key of Object.keys(schema.def)) {
		if (key in value) ordered[key] = value[key as keyof T];
	}
	return ordered as T;
};

/** Whether tsv was one of a scenario's formatters, timed or only checked. */
const scenario_has_tsv = (scenario: FormatterScenario): boolean =>
	scenario.timings.some((timing) => timing.name === 'tsv') ||
	(scenario.aborted !== undefined && scenario.preflight.some((p) => p.name === 'tsv'));

/**
 * Validate the harness's `results.json` and keep the scenarios tsv runs in.
 *
 * Throws rather than returning a partial result: a renamed key or a scenario with
 * nothing under it would otherwise strip numbers from the site silently. The
 * caller decides what a MISSING report means (the sibling checkout is optional);
 * everything past that point is a broken contract.
 *
 * @param results - the parsed `results.json`
 * @returns the validated benchmarks, tsv's scenarios only
 * @throws if the report doesn't match `FormatterBenchmarks`, a scenario carries
 * neither timings nor an abort or a `fastest` that disagrees with its timings, no
 * scenario timed tsv, or the versions list lacks tsv
 */
export const parse_formatter_benchmarks = (results: unknown): FormatterBenchmarks => {
	const parsed = s.parse(FormatterBenchmarks, results);
	if (!parsed.ok) {
		throw new Error(`formatter benchmarks: ${parsed.issues.map(s.format_issue).join('\n')}`);
	}
	const { scenarios: all_scenarios, ...report } = parsed.value;

	for (const scenario of all_scenarios) {
		// A scenario with no timings either aborted before hyperfine ran — it says so,
		// and its preflight rows name the cause — or recorded nothing it should have.
		if (scenario.timings.length === 0 && scenario.aborted === undefined) {
			throw new Error(`formatter benchmarks: scenario "${scenario.name}" has no timings`);
		}
		// `fastest` names a timed row, so it is present exactly when rows were timed
		if ((scenario.fastest === undefined) !== (scenario.timings.length === 0)) {
			throw new Error(
				`formatter benchmarks: scenario "${scenario.name}" has ${scenario.timings.length} timings but fastest ${JSON.stringify(scenario.fastest)}`
			);
		}
	}

	// tsv has no JSX/TSX parser, so it sits out some scenarios by design — but if it
	// was timed in NONE of them, either the harness stopped benching tsv or its row
	// was renamed, and the site would render a comparison without its subject.
	const scenarios = all_scenarios.filter(scenario_has_tsv).map((scenario) =>
		in_schema_order(FormatterScenario, {
			...scenario,
			preflight: scenario.preflight.map((row) => in_schema_order(FormatterPreflight, row)),
			timings: scenario.timings.map((row) => in_schema_order(FormatterTiming, row)),
			speedups: scenario.speedups.map((row) => in_schema_order(FormatterSpeedup, row)),
			memory: scenario.memory.map((row) => in_schema_order(FormatterMemory, row))
		})
	);
	if (!scenarios.some((scenario) => scenario.timings.some((timing) => timing.name === 'tsv'))) {
		throw new Error(
			`formatter benchmarks: no scenario includes a tsv row (found ${all_scenarios
				.map((scenario) => scenario.id)
				.join(', ')})`
		);
	}

	if (!report.versions.tsv) {
		throw new Error('formatter benchmarks: no tsv version in the report');
	}

	// the variant key first, as the schema has it
	const { source, ...tsv_binary_rest } = report.tsv_binary;
	const tsv_binary = { source, ...tsv_binary_rest } as typeof report.tsv_binary;
	return in_schema_order(FormatterBenchmarks, {
		...report,
		machine: in_schema_order(FormatterBenchmarks.def.machine, report.machine),
		node_startup: in_schema_order(FormatterBenchmarks.def.node_startup, report.node_startup),
		tsv_binary,
		scenarios
	});
};
