import { assert, describe, test } from "vitest";

import { parse_formatter_benchmarks } from "$routes/docs/benchmarks/formatter_benchmark_data.ts";

// A trimmed stand-in for the bench harness's README — one scenario tsv runs in,
// one it sits out, plus the versions and machine lines below the results block.
const readme = `# Benchmark

<!-- BENCHMARK_RESULTS_START -->

\`\`\`
=========================================
Benchmarking Large Single File
=========================================

Target: TypeScript compiler parser.ts (~540KB)
- 2 warmup runs, 5 benchmark runs
- Copy original before each run


Preflight (per-formatter parse check):
  biome: clean
  oxfmt: 3 rejected
  tsv: unavailable (command failed to launch)
Benchmark 1: biome
  Time (mean ± σ):      1.597 s ±  0.015 s    [User: 1.583 s, System: 0.846 s]
  Range (min … max):    1.581 s …  1.614 s    5 runs

Benchmark 2: tsv
  Time (mean ± σ):     28.8 ms ±   0.7 ms    [User: 15.2 ms, System: 13.5 ms]
  Range (min … max):    27.8 ms …  29.5 ms    5 runs

Summary
  tsv ran
   55.41 ± 1.36 times faster than biome

Memory Usage:
  biome: 303.2 MB (min: 291.5 MB, max: 319.4 MB, 13.12 ± 0.62 times more than tsv)
  tsv: 23.1 MB (min: 22.5 MB, max: 23.9 MB)

Large single file benchmark complete!


=========================================
Benchmarking Mixed (embedded)
=========================================

Target: Storybook repository (mixed with embedded languages)
- 1 warmup runs, 3 benchmark runs
- Git reset before each run

Benchmark 1: oxfmt
  Time (mean ± σ):      7.832 s ±  0.209 s    [User: 82.370 s, System: 5.801 s]
  Range (min … max):    7.622 s …  8.040 s    3 runs

Mixed (embedded) benchmark complete!


=========================================
Benchmarking Svelte (tsv vs rsvelte-fmt)
=========================================

Target: third-party .svelte corpus (kit, svelte.dev, layerchart)
- 2 warmup runs, 5 benchmark runs
- Git reset before each run
- .svelte only: the two Svelte-native formatters head-to-head


Preflight (per-formatter parse check):
  tsv: clean
  rsvelte-fmt: CRASHED during check (exit 134)
  → rsvelte-fmt crashed partway through its check — its coverage is unknown and its timed runs may crash too
Benchmark 1: tsv
  Time (mean ± σ):      52.3 ms ±   1.1 ms    [User: 255.0 ms, System: 194.2 ms]
  Range (min … max):    50.9 ms …  53.6 ms    5 runs

Benchmark 2: rsvelte-fmt
  Time (mean ± σ):     272.9 ms ±   3.9 ms    [User: 1016.7 ms, System: 408.5 ms]
  Range (min … max):   268.1 ms … 277.6 ms    5 runs

Summary
  tsv ran
    5.22 ± 0.13 times faster than rsvelte-fmt

Memory Usage:
  tsv: 19.0 MB (min: 18.6 MB, max: 19.4 MB)
  rsvelte-fmt: 61.1 MB (min: 60.2 MB, max: 62.0 MB, 3.22 ± 0.08 times more than tsv)

Svelte benchmark complete!
\`\`\`

<!-- BENCHMARK_RESULTS_END -->

## Versions

- **Prettier**: 3.9.1
- **Biome**: 2.5.1
- **rsvelte-fmt**: 0.7.4
- **tsv**: 0.2.0

_Measured on: Some CPU · 12 threads · linux x64 — the ratios below depend on the core count._
`;

describe("parse_formatter_benchmarks", () => {
  test("keeps only the scenarios tsv runs in", () => {
    const parsed = parse_formatter_benchmarks(readme);
    assert.deepEqual(
      parsed.scenarios.map((s) => s.id),
      ["large-single-file", "svelte-tsv-vs-rsvelte-fmt"],
    );
  });

  test("parses the machine and versions from below the results block", () => {
    const parsed = parse_formatter_benchmarks(readme);
    assert.equal(parsed.machine, "Some CPU · 12 threads · linux x64");
    assert.deepEqual(parsed.versions, {
      prettier: "3.9.1",
      biome: "2.5.1",
      "rsvelte-fmt": "0.7.4",
      tsv: "0.2.0",
    });
  });

  test("normalizes timings to milliseconds across units", () => {
    const parsed = parse_formatter_benchmarks(readme);
    const [biome, tsv] = parsed.scenarios[0]!.timings;
    assert.deepEqual(biome, {
      name: "biome",
      mean_ms: 1597,
      stddev_ms: 15,
      user_ms: 1583,
      system_ms: 846,
      min_ms: 1581,
      max_ms: 1614,
    });
    assert.equal(tsv!.mean_ms, 28.8);
  });

  test("parses the scenario header, preflight, speedups, and memory", () => {
    const scenario = parse_formatter_benchmarks(readme).scenarios[0]!;
    assert.equal(scenario.name, "Large Single File");
    assert.equal(scenario.target, "TypeScript compiler parser.ts (~540KB)");
    assert.equal(scenario.warmup_runs, 2);
    assert.equal(scenario.benchmark_runs, 5);
    assert.deepEqual(scenario.preflight, [
      { name: "biome", rejected: 0, unavailable: false, crashed: false },
      { name: "oxfmt", rejected: 3, unavailable: false, crashed: false },
      { name: "tsv", rejected: 0, unavailable: true, crashed: false },
    ]);
    assert.equal(scenario.baseline, "tsv");
    assert.deepEqual(scenario.speedups, [
      { name: "biome", ratio: 55.41, ratio_stddev: 1.36 },
    ]);
    // the lowest-memory formatter is the ratio baseline, so it carries no ratio
    assert.deepEqual(scenario.memory, [
      {
        name: "biome",
        mean_mb: 303.2,
        min_mb: 291.5,
        max_mb: 319.4,
        ratio: 13.12,
        ratio_stddev: 0.62,
      },
      { name: "tsv", mean_mb: 23.1, min_mb: 22.5, max_mb: 23.9 },
    ]);
  });

  test("parses a two-formatter scenario with a crashed preflight row", () => {
    const scenario = parse_formatter_benchmarks(readme).scenarios[1]!;
    assert.equal(scenario.name, "Svelte (tsv vs rsvelte-fmt)");
    assert.deepEqual(scenario.preflight, [
      { name: "tsv", rejected: 0, unavailable: false, crashed: false },
      { name: "rsvelte-fmt", rejected: 0, unavailable: false, crashed: true },
    ]);
    assert.deepEqual(
      scenario.timings.map((t) => t.name),
      ["tsv", "rsvelte-fmt"],
    );
    assert.equal(scenario.baseline, "tsv");
    assert.deepEqual(scenario.speedups, [
      { name: "rsvelte-fmt", ratio: 5.22, ratio_stddev: 0.13 },
    ]);
    // tsv is the memory baseline here, so the ratio sits on the rsvelte-fmt row
    assert.deepEqual(scenario.memory, [
      { name: "tsv", mean_mb: 19, min_mb: 18.6, max_mb: 19.4 },
      {
        name: "rsvelte-fmt",
        mean_mb: 61.1,
        min_mb: 60.2,
        max_mb: 62,
        ratio: 3.22,
        ratio_stddev: 0.08,
      },
    ]);
  });

  // A README that's present but drifted must fail the gen task rather than quietly
  // publishing stale or scenario-stripped numbers — only a MISSING readme is benign,
  // and that's the caller's call, not the parser's.
  test("throws when the results markers are missing", () => {
    assert.throws(
      () => parse_formatter_benchmarks("# Benchmark\n\nno results here\n"),
      /no <!-- BENCHMARK_RESULTS_START/,
    );
  });

  test("throws when no scenario includes tsv", () => {
    const without_tsv = readme.replace(
      /^Benchmark (\d+): tsv$/gm,
      "Benchmark $1: oxfmt",
    );
    assert.throws(
      () => parse_formatter_benchmarks(without_tsv),
      /no scenario includes a tsv row/,
    );
  });

  test("throws when a scenario banner carries no parseable timings", () => {
    const drifted = readme.replace(/^Benchmark \d+: /gm, "Bench $&");
    assert.throws(
      () => parse_formatter_benchmarks(drifted),
      /no parseable timings/,
    );
  });

  test("throws when a present memory section yields no rows", () => {
    const drifted = readme
      .replace(/^ {2}biome: 303\.2 MB.*$/m, "  biome: 303.2 megabytes")
      .replace(/^ {2}tsv: 23\.1 MB.*$/m, "  tsv: 23.1 megabytes");
    assert.throws(
      () => parse_formatter_benchmarks(drifted),
      /unparseable memory section/,
    );
  });

  test("throws when the machine line or tsv version is missing", () => {
    assert.throws(
      () =>
        parse_formatter_benchmarks(readme.replace(/^_Measured on: .*$/m, "")),
      /machine line/,
    );
    assert.throws(
      () =>
        parse_formatter_benchmarks(readme.replace(/^- \*\*tsv\*\*: .*$/m, "")),
      /no tsv version/,
    );
  });
});
