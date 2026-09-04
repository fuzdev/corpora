// Types and parser for the formatter comparison benchmark — Prettier, Biome,
// Oxfmt, rsvelte-fmt, and tsv on shared corpora. Unlike the tsv bench reports, that harness
// emits no JSON: its numbers exist only as the hyperfine console dump embedded
// in its README between the `BENCHMARK_RESULTS_START`/`END` markers, plus a
// `## Versions` list and a `_Measured on: …_` machine line. This module turns
// that text into data; `benchmarks_formatters.gen.json.ts` writes it out.

/** A single formatter's timing in one scenario. All durations in milliseconds. */
export interface FormatterTiming {
  name: string;
  mean_ms: number;
  stddev_ms: number;
  min_ms: number;
  max_ms: number;
  user_ms: number;
  system_ms: number;
}

/** A single formatter's peak-RSS measurement in one scenario. */
export interface FormatterMemory {
  name: string;
  mean_mb: number;
  min_mb: number;
  max_mb: number;
  /** Ratio to the scenario's lowest-memory formatter; absent on that baseline row. */
  ratio?: number;
  ratio_stddev?: number;
}

/** How a scenario's fastest formatter compares to one of the others. */
export interface FormatterSpeedup {
  name: string;
  ratio: number;
  ratio_stddev: number;
}

/**
 * A formatter's parse-check result over the scenario's corpus. The harness runs
 * this before timing so a tool that rejects files isn't credited for skipping
 * them.
 */
export interface FormatterPreflight {
  name: string;
  /** Files the formatter refused to parse. */
  rejected: number;
  /** The formatter's binary never launched, so its timing row is meaningless. */
  unavailable: boolean;
  /** The check pass crashed partway (exit ≥ 128), so its coverage is unknown. */
  crashed: boolean;
}

/** One benchmark scenario — a corpus benched across every formatter that supports it. */
export interface FormatterScenario {
  /** Slug derived from `name`, e.g. `large-single-file`. */
  id: string;
  name: string;
  /** The corpus, as the harness describes it. */
  target: string;
  warmup_runs: number;
  benchmark_runs: number;
  preflight: Array<FormatterPreflight>;
  timings: Array<FormatterTiming>;
  /** The fastest formatter and its margin over each other one. */
  baseline: string;
  speedups: Array<FormatterSpeedup>;
  memory: Array<FormatterMemory>;
}

/**
 * The parsed formatter comparison. Only scenarios tsv participates in are
 * included — it has no JSX/TSX parser, so the harness runs it on the JSX-free
 * corpora only and the other scenarios have no tsv row to compare against.
 */
export interface FormatterBenchmarks {
  /**
   * The machine the numbers came from. The ratios move with it — Biome, Oxfmt,
   * and tsv scale across cores while Prettier is effectively serial.
   */
  machine: string;
  /** Formatter name to version string, e.g. `prettier` to `3.9.1`. */
  versions: Record<string, string>;
  scenarios: Array<FormatterScenario>;
}

const to_slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Milliseconds from a hyperfine duration and its unit, e.g. `1.597` + `s`. */
const to_ms = (value: string, unit: string): number => {
  const n = Number(value);
  if (unit === "s") return n * 1000;
  if (unit === "ms") return n;
  if (unit === "µs" || unit === "us") return n / 1000;
  throw new Error(`unknown duration unit: ${unit}`);
};

// The console dump the harness writes into its README.
const RESULTS_START = "<!-- BENCHMARK_RESULTS_START -->";
const RESULTS_END = "<!-- BENCHMARK_RESULTS_END -->";

const SCENARIO_RE = /^=+\nBenchmarking (.+)\n=+$/gm;
const TARGET_RE = /^Target: (.+)$/m;
const RUNS_RE = /^- (\d+) warmup runs?, (\d+) benchmark runs?$/m;
const TIMING_RE =
  /^Benchmark \d+: (.+)\n\s*Time \(mean ± σ\):\s*([\d.]+) (\S+) ±\s*([\d.]+) (\S+)\s*\[User: ([\d.]+) (\S+), System: ([\d.]+) (\S+)\]\n\s*Range \(min … max\):\s*([\d.]+) (\S+) …\s*([\d.]+) (\S+)/gm;
const SPEEDUP_BASELINE_RE = /^Summary\n\s*(.+?) ran$/m;
const SPEEDUP_RE = /^\s*([\d.]+) ± ([\d.]+) times faster than (.+)$/gm;
const MEMORY_RE =
  /^\s*(\S+): ([\d.]+) MB \(min: ([\d.]+) MB, max: ([\d.]+) MB(?:, ([\d.]+) ± ([\d.]+) times more than \S+)?\)$/gm;
const PREFLIGHT_HEADING = "Preflight (per-formatter parse check):";
const PREFLIGHT_RE = /^\s{2}(\S+): (clean|unavailable|\d+ rejected|CRASHED)/gm;
const VERSIONS_RE = /^## Versions\n\n((?:- \*\*.+\*\*: .+\n)+)/m;
const VERSION_RE = /^- \*\*(.+?)\*\*: (.+)$/gm;
const MACHINE_RE = /^_Measured on: (.+?)(?: — |_$)/m;

/** The text of one section of a scenario block, between two of its headings. */
const slice_section = (
  block: string,
  start: string,
  ...ends: Array<string>
): string => {
  const from = block.indexOf(start);
  if (from === -1) return "";
  const rest = block.slice(from + start.length);
  const to = ends.reduce((lowest, end) => {
    const i = rest.indexOf(end);
    return i === -1 || i >= lowest ? lowest : i;
  }, rest.length);
  return rest.slice(0, to);
};

const parse_timings = (block: string): Array<FormatterTiming> =>
  [...block.matchAll(TIMING_RE)].map((m) => ({
    name: m[1]!.trim(),
    mean_ms: to_ms(m[2]!, m[3]!),
    stddev_ms: to_ms(m[4]!, m[5]!),
    user_ms: to_ms(m[6]!, m[7]!),
    system_ms: to_ms(m[8]!, m[9]!),
    min_ms: to_ms(m[10]!, m[11]!),
    max_ms: to_ms(m[12]!, m[13]!),
  }));

const parse_preflight = (block: string): Array<FormatterPreflight> =>
  [
    ...slice_section(block, PREFLIGHT_HEADING, "Benchmark 1:").matchAll(
      PREFLIGHT_RE,
    ),
  ].map((m) => ({
    name: m[1]!,
    rejected: Number.parseInt(m[2]!, 10) || 0,
    unavailable: m[2] === "unavailable",
    crashed: m[2] === "CRASHED",
  }));

const parse_memory = (block: string): Array<FormatterMemory> =>
  [
    ...slice_section(block, "Memory Usage:", " benchmark complete!").matchAll(
      MEMORY_RE,
    ),
  ].map((m) => ({
    name: m[1]!,
    mean_mb: Number(m[2]),
    min_mb: Number(m[3]),
    max_mb: Number(m[4]),
    ...(m[5] === undefined
      ? null
      : { ratio: Number(m[5]), ratio_stddev: Number(m[6]) }),
  }));

const parse_scenario = (name: string, block: string): FormatterScenario => {
  const runs = RUNS_RE.exec(block);
  const summary = slice_section(
    block,
    "Summary\n",
    "Memory Usage:",
    " benchmark complete!",
  );
  const timings = parse_timings(block);
  // A scenario banner with no timings under it means the timing lines changed
  // shape, not that the harness measured nothing — hyperfine always prints them.
  if (timings.length === 0) {
    throw new Error(
      `formatter benchmarks: scenario "${name}" has no parseable timings`,
    );
  }
  // Distinguish "not measured" from "misparsed": these sections are optional (no
  // GNU time, no preflight in the JSX scenarios), but a section that's present
  // and yields no rows is a broken pattern.
  const memory = parse_memory(block);
  if (block.includes("Memory Usage:") && memory.length === 0) {
    throw new Error(
      `formatter benchmarks: scenario "${name}" has an unparseable memory section`,
    );
  }
  const preflight = parse_preflight(block);
  if (block.includes(PREFLIGHT_HEADING) && preflight.length === 0) {
    throw new Error(
      `formatter benchmarks: scenario "${name}" has an unparseable preflight section`,
    );
  }
  return {
    id: to_slug(name),
    name,
    target: TARGET_RE.exec(block)?.[1] ?? "",
    warmup_runs: Number(runs?.[1] ?? 0),
    benchmark_runs: Number(runs?.[2] ?? 0),
    preflight,
    timings,
    baseline: SPEEDUP_BASELINE_RE.exec(block)?.[1] ?? "",
    speedups: [...summary.matchAll(SPEEDUP_RE)].map((m) => ({
      name: m[3]!.trim(),
      ratio: Number(m[1]),
      ratio_stddev: Number(m[2]),
    })),
    memory,
  };
};

/**
 * Parse the formatter comparison out of the bench harness's README, keeping only
 * the scenarios tsv runs in.
 *
 * Throws rather than returning a partial result: the harness publishes no JSON,
 * so this parses prose, and a drifted heading or timing line would otherwise
 * strip scenarios from the site silently. The caller decides what a MISSING
 * README means (the sibling checkout is optional); everything past that point is
 * a broken contract.
 *
 * @param readme - the full README text, markers included
 * @returns the parsed benchmarks
 * @throws if the results markers, the scenario banners, the versions list, the
 * machine line, or any tsv scenario's numbers can't be parsed
 */
export const parse_formatter_benchmarks = (
  readme: string,
): FormatterBenchmarks => {
  const start = readme.indexOf(RESULTS_START);
  const end = readme.indexOf(RESULTS_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `formatter benchmarks: no ${RESULTS_START} / ${
        RESULTS_END
      } block — is this the harness's readme?`,
    );
  }
  const results = readme.slice(start + RESULTS_START.length, end);

  // Split on the scenario banners, pairing each title with the text that follows
  // it up to the next banner.
  const headings = [...results.matchAll(SCENARIO_RE)];
  if (headings.length === 0) {
    throw new Error(
      "formatter benchmarks: results block carries no scenario banners",
    );
  }
  const parsed = headings.map(({ 0: heading, 1: name, index }, i) =>
    parse_scenario(
      name!.trim(),
      results.slice(index + heading.length, headings[i + 1]?.index),
    ),
  );
  // tsv has no JSX/TSX parser, so it sits out some scenarios by design — but if it
  // ran in NONE of them, either the harness stopped benching tsv or the timing
  // labels drifted, and the site would render a comparison without its subject.
  const scenarios = parsed.filter((scenario) =>
    scenario.timings.some((timing) => timing.name === "tsv"),
  );
  if (scenarios.length === 0) {
    throw new Error(
      `formatter benchmarks: no scenario includes a tsv row (found ${parsed
        .map((s) => s.id)
        .join(", ")})`,
    );
  }

  const versions: Record<string, string> = {};
  const versions_block = VERSIONS_RE.exec(readme)?.[1] ?? "";
  for (const m of versions_block.matchAll(VERSION_RE)) {
    versions[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  if (!versions.tsv) {
    throw new Error(
      "formatter benchmarks: no tsv version in the readme's `## Versions` list",
    );
  }

  // The ratios move with the core count, so a report that can't say which machine
  // produced it isn't publishable.
  const machine = MACHINE_RE.exec(readme)?.[1]?.trim();
  if (!machine) {
    throw new Error("formatter benchmarks: no `_Measured on: …_` machine line");
  }

  return { machine, versions, scenarios };
};
