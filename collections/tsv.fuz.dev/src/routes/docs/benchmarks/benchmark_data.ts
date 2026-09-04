// Raw types matching the tsv bench's per-runtime report format
// (`benches/js/results/report.<runtime>.json` — the site's flagship detailed
// view is the Node report, the N-API native path)

export interface BenchmarkBaseline {
  version: number;
  // The runtime that produced this report (`node` for the flagship view).
  // Present from report `version` 5 on.
  runtime?: string;
  timestamp: string;
  git_commit: string;
  corpus: Record<string, number>;
  versions: BaselineVersions;
  binary_sizes: Array<BinarySize>;
  entries: Array<BaselineEntry>;
  // Counts of silenced third-party stderr noise, keyed by message pattern.
  // Present from baseline `version` 4 on; not rendered, kept for parity.
  suppressed_noise?: Record<string, number>;
  // Same-engine native/wasm pairs whose pre-flight accept sets or output bytes
  // disagreed — `[]` when healthy. A non-empty list is a binding-boundary bug in
  // the producing bench (see tsv's `check_variant_parity`), caught at review time
  // in the copied report's diff; not rendered, kept for parity. Absent on
  // older reports — treat as optional.
  variant_parity?: Array<VariantParityFinding>;
  // Which corpus/surface produced the report: `perf` (real-world corpus,
  // format + parse) or `conformance` (the deliberately-hard fixture suites,
  // disjoint from the perf corpus, parse only). Present from `version` 6 on.
  corpus_kind?: "perf" | "conformance";
  // Per-entry corpus composition (path + loaded file count) — discloses which
  // sources were present on the machine that produced the report. Present
  // from `version` 6 on.
  corpus_sources?: Array<CorpusSource>;
  // The machine that produced the report — CPU model, OS/arch, runtime version.
  // The throughput numbers are machine-relative, so this is the environment the
  // meta panel discloses. Present from `version` 7 on (absent on older reports).
  machine?: Machine;
  // Per-corpus-source coverage — `group → source → impl → {processed, total}`,
  // the machine-readable half of the per-source tables in tsv's own markdown
  // report. Conformance reports only (the perf surface is 100% by construction).
  // Present from `version` 8 on; not rendered — this page shows each group's
  // aggregate, which blends corpora answering different questions, so these rows
  // are the sharper view if it ever grows one.
  coverage_by_source?: Record<
    string,
    Record<string, Record<string, SourceCoverageCell>>
  >;
  // Artifacts the size table reached for and didn't find. That table's
  // COMPOSITION varies by the producing machine — a row exists only for a built
  // artifact — so this is what tells a missing row apart from an artifact that
  // stopped being produced. Present from `version` 11 on; not rendered, kept for
  // parity.
  binary_sizes_absent?: Array<string>;
  // Implementations that failed to initialize on the producing machine, as
  // `{impl, reason, rows}`. An impl that doesn't load contributes NO row, so
  // without this a tool that broke upstream is indistinguishable from one that was
  // never measured (the Node report should be `[]`; Bun's carries its two known
  // load failures). Present from `version` 10 on, `rows` from `version` 12; not
  // rendered here, kept for parity.
  unavailable?: Array<UnavailableImpl>;
  // Files a byte-graded row ACCEPTED whose output the producing bench's
  // byte-parity check could not digest, as `{"<group>/<row>": count}` — `{}` when
  // every accepted output was gradeable, which is the healthy state. The one known
  // cause is a pathologically deep AST overflowing V8's recursive `JSON.stringify`.
  // Unlike every other field here it records a measurement the run could NOT make,
  // so a growing count means that check is quietly covering less. Present from
  // `version` 13 on; not rendered, kept for parity.
  output_digest_ungraded?: Record<string, number>;
}

// Per-impl coverage for one corpus source (see `coverage_by_source`).
export interface SourceCoverageCell {
  processed: number;
  total: number;
}

// One implementation that failed to load on the machine that produced a report
// (see `BenchmarkBaseline.unavailable`). Mirrors the bench's `UnavailableImpl`.
//
// `impl` is the bench's init-line LABEL (`Biome`, `OXC WASM`) and matches no row
// name — `rows` is the joinable identity, and the only one to look a row up by.
export interface UnavailableImpl {
  impl: string;
  reason: string;
  // The row names this failure removed from the tables. Absent on `version` 11
  // and older reports.
  rows?: Array<string>;
}

// A same-engine pair that disagreed — one engine behind two bindings
// (native/wasm), or one binding under two options. Mirrors the bench's
// `VariantParityFinding` (see `BenchmarkBaseline.variant_parity`); the
// neutral keys arrived with report `version` 9, which is also when the check
// started pairing options (older reports spell them `native`/`wasm`).
export interface VariantParityFinding {
  group: string;
  impl: string;
  sibling: string;
  // files only `impl` accepted
  impl_only: number;
  // files only `sibling` accepted
  sibling_only: number;
  // files BOTH accepted whose outputs differ byte-for-byte, and up to three of
  // their paths. Only tsv's own native/wasm pair is graded on bytes, and a
  // non-zero count fails the producing bench outright, so these are absent
  // here in practice — kept for parity with the report shape. Absent on
  // reports older than the byte check; treat as optional.
  output_mismatch?: number;
  output_mismatch_examples?: Array<string>;
}

// The hardware/runtime a report was measured on. Excludes hostname (the reports
// are published) and volatile fields (free memory, load) that would churn.
export interface Machine {
  cpu_model: string;
  os: string;
  arch: string;
  // The producing runtime's own version (`node`/`deno`/`bun` version string).
  runtime_version: string;
}

export interface CorpusSource {
  path: string;
  files: number;
  // Per-language split of `files` (svelte/typescript/css counts summing to
  // `files`). Present on reports whose loader emitted it; older reports carry
  // only the `files` total, so treat it as optional.
  by_language?: Partial<Record<string, number>>;
  // The source's GitHub origin, git-detected by the bench at report-build time
  // (URL + commit + subpath). Absent on older reports and on sources with no
  // GitHub remote — presence keys on the field, not the report `version` (it
  // arrived without one and is not tied to any), so treat it as optional.
  repo?: CorpusRepoRef;
}

// A corpus source's GitHub origin — see `CorpusSource.repo` and `corpus_source_url`.
export interface CorpusRepoRef {
  // Canonical https GitHub URL, e.g. `https://github.com/sveltejs/svelte`.
  url: string;
  // `owner/name` (e.g. `sveltejs/svelte`) — a compact label.
  slug: string;
  // The commit the corpus was loaded at (full SHA); `''` for a harvested cache
  // linked at its canonical upstream root (no pin).
  commit: string;
  // Path within the repo to this source (`''` = repo root).
  subpath: string;
}

/**
 * The GitHub URL for a corpus source, pinned to the measured commit + subpath
 * (`…/tree/<commit>/<subpath>`) when detected, or the repo root for a
 * canonical-upstream cache (empty `commit`). `undefined` when the source has no
 * detected origin (older reports, or the local `svelte_styles` cache).
 */
export const corpus_source_url = (source: CorpusSource): string | undefined => {
  const repo = source.repo;
  if (!repo) return undefined;
  if (!repo.commit) return repo.url;
  return repo.subpath
    ? `${repo.url}/tree/${repo.commit}/${repo.subpath}`
    : `${repo.url}/tree/${repo.commit}`;
};

export interface BaselineEntry {
  name: string;
  group: string;
  // Timing stats are `null` on a coverage-only report (the conformance surface
  // the site refreshes from — parse coverage measured, timed phase skipped). A
  // perf report always carries real numbers, and only the perf path
  // (`derive_benchmark_groups`) reads these, so the nulls are unreachable there
  // but must be expressed for the shared cast to stay sound.
  mean_ns: number | null;
  p50_ns: number | null;
  p75_ns: number | null;
  p90_ns: number | null;
  p95_ns: number | null;
  p99_ns: number | null;
  min_ns: number | null;
  max_ns: number | null;
  std_dev_ns: number | null;
  cv: number | null;
  ops_per_second: number | null;
  sample_size: number | null;
  // Per-implementation preflight coverage: files this impl processed / the
  // language's total discovered files. Present from baseline `version` 3 on;
  // absent (or `null`) in older baselines.
  files_processed?: number | null;
  files_total?: number | null;
  // Files this impl was actually timed on (the per-group intersection in
  // default mode). Present from baseline `version` 4 on.
  files_iterated?: number | null;
  // Present from report `version` 5 on (matches the report's top-level);
  // not rendered, kept for parity.
  runtime?: string;
}

export interface BaselineVersions {
  tsv: string;
  svelte: string;
  acorn: string;
  acorn_ts: string;
  prettier: string;
  prettier_svelte: string;
  oxc_parser?: string;
  oxfmt?: string;
  // `yuku-parser` (N-API) and `@yuku-parser/wasm` — one Zig engine behind two
  // bindings, versioned in lockstep upstream. Absent on reports produced before
  // the yuku rows.
  yuku_parser?: string;
  yuku_parser_wasm?: string;
  biome?: string;
  // `@dprint/typescript` — the plugin version (the host `@dprint/formatter` is
  // just the Wasm loader). Absent on reports produced before the dprint row.
  dprint?: string;
  // `@rsvelte/fmt` — the coverage-only Svelte formatter row. Absent on reports
  // produced before the rsvelte-fmt row.
  rsvelte_fmt?: string;
  // `dprint-plugin-malva` — dprint's CSS formatter plugin, over the same Wasm
  // host as `dprint` above. Absent on reports produced before the malva row.
  malva?: string;
  // `postcss` — the CSS parser row. Absent on reports produced before it.
  postcss?: string;
  // `@rsvelte/vite-plugin-svelte-native` — the N-API addon behind the Svelte
  // PARSE rows, a different package from `@rsvelte/fmt` above and versioned
  // independently. Absent on reports produced before those rows.
  rsvelte_parse?: string;
  // The upstream Svelte version that addon targets (its own `VERSION` export),
  // which is not its package version — a drift from the `svelte` pin means those
  // rows parse to a different Svelte than the svelte/compiler row beside them.
  rsvelte_parse_svelte_target?: string;
  // `@swc/core` — the TypeScript/JS parser row. Absent on reports produced
  // before it.
  swc?: string;
}

export interface BinarySize {
  label: string;
  bytes: number;
  kind: "native" | "wasm";
  // Gzipped on-disk size (≈ npm-tarball wire size); `null` when `gzip` was
  // unavailable on the machine that generated the baseline.
  gzip_bytes: number | null;
}

// Display types

export type ImplementationCategory =
  | "canonical"
  | "tsv_native"
  | "tsv_native_json"
  | "tsv_wasm"
  | "tsv_wasm_json"
  | "biome"
  | "dprint"
  | "oxc"
  | "postcss"
  | "rsvelte"
  | "swc"
  | "yuku";

export interface BenchmarkGroup {
  operation: string;
  language: string;
  entries: Array<BenchmarkDisplayEntry>;
  canonical_entry: BenchmarkDisplayEntry | undefined;
  // files the timed benchmark actually iterated (the per-group intersection);
  // null on older baselines (< version 4) that don't carry `files_iterated`
  files_iterated: number | null;
}

export interface BenchmarkDisplayEntry {
  name: string;
  mean_ns: number;
  bar_fraction: number;
  category: ImplementationCategory;
  files_processed: number | null;
  files_total: number | null;
  // A placeholder entry mirrored from another language's group for a tool that
  // doesn't run in this one (e.g. `oxc-parser` under svelte/css parse) — rendered
  // grayed-out and inert so the parse groups share one entry order. Absent on real,
  // measured entries. Also set on a `coverage_only` row, which shares the inert
  // rendering for a different reason (see below).
  disabled?: boolean;
  // The harness measured this tool's COVERAGE but deliberately never timed it —
  // it ships no in-process API, so a per-file row would have measured process
  // spawn rather than format work (`rsvelte-fmt`; see the tsv harness's
  // §Coverage-only rows). Distinct from a plain `disabled` placeholder: that one
  // never ran here at all, while this one ran over the whole corpus and has real
  // `files_processed`/`files_total` to show. Both render inert; only this one
  // carries a coverage annotation and needs the page to explain itself.
  coverage_only?: boolean;
}

export interface SpeedupRow {
  variant: string;
  format_svelte: number | undefined;
  format_typescript: number | undefined;
  format_css: number | undefined;
}

// Implementation categorization

const CATEGORY_BY_NAME: Record<string, ImplementationCategory> = {
  prettier: "canonical",
  "svelte/compiler": "canonical",
  "acorn-typescript": "canonical",
  tsv: "tsv_native",
  "tsv-json": "tsv_native_json",
  "tsv-json-no-locations": "tsv_native_json",
  "tsv-internal": "tsv_native",
  tsv_wasm: "tsv_wasm",
  "tsv_wasm-json": "tsv_wasm_json",
  "tsv_wasm-json-no-locations": "tsv_wasm_json",
  "tsv_wasm-internal": "tsv_wasm",
  "biome-wasm": "biome",
  "dprint-wasm": "dprint",
  // malva is dprint's own CSS plugin, loaded through the same Wasm host, so it
  // shares dprint's category rather than claiming a hue of its own — the palette
  // has ten and all ten are spoken for.
  "malva-wasm": "dprint",
  "oxc-parser": "oxc",
  "oxc-parser-wasm": "oxc",
  oxfmt: "oxc",
  postcss: "postcss",
  "rsvelte-fmt": "rsvelte",
  // The parse rows come from a different package than `rsvelte-fmt`, but the same
  // tool, so one category covers all three.
  "rsvelte-parse": "rsvelte",
  "rsvelte-parse-skip-expr-loc": "rsvelte",
  swc: "swc",
  "yuku-parser": "yuku",
  "yuku-parser-wasm": "yuku",
};

export const categorize_name = (name: string): ImplementationCategory =>
  CATEGORY_BY_NAME[name] ?? "oxc";

export const categorize_size = (label: string): ImplementationCategory => {
  // covers `tsv_wasm` plus the `tsv_format_wasm`/`tsv_parse_wasm` subsets
  if (label.startsWith("tsv") && label.includes("wasm")) return "tsv_wasm";
  if (label.startsWith("tsv")) return "tsv_native";
  if (label.startsWith("biome")) return "biome";
  if (label.startsWith("dprint")) return "dprint";
  if (label.startsWith("malva")) return "dprint"; // dprint's CSS plugin — see CATEGORY_BY_NAME
  // Covers both `rsvelte-fmt (binary)` and `rsvelte compiler (napi)`.
  if (label.startsWith("rsvelte")) return "rsvelte";
  if (label.startsWith("swc")) return "swc";
  if (label.startsWith("yuku")) return "yuku";
  return "oxc"; // oxc-parser / oxfmt, and any unrecognized label
};

// Primary tsv entry names for speedup summary (fair comparisons)
const PRIMARY_NATIVE_FORMAT = "tsv";
const PRIMARY_WASM_FORMAT = "tsv_wasm";

// Derivation functions

// Shared display order for benchmark groups: format before parse, then by
// language — used by the detailed, conformance, and cross-runtime views alike.
const OPERATION_ORDER: Record<string, number> = { format: 0, parse: 1 };
const LANGUAGE_ORDER: Record<string, number> = {
  svelte: 0,
  typescript: 1,
  css: 2,
};

/**
 * Fixed slot for a format/parse row, applied in place of a size-ordered sort so the
 * rows read in a stable, meaningful sequence across every group: the canonical
 * reference first (the default 1.0x anchor), then the cross-tool comparisons
 * (alphabetically: biome, dprint — whose category malva shares — oxc, postcss,
 * rsvelte, swc, yuku), then tsv's JSON-materializing
 * wires (the span-only `no-locations` wire before the default `loc`-carrying one),
 * then tsv's raw internal engine.
 */
const speed_entry_rank = (entry: BenchmarkDisplayEntry): number => {
  if (entry.category === "canonical") return 0;
  if (entry.category === "biome") return 1;
  if (entry.category === "dprint") return 2;
  if (entry.category === "oxc") return 3;
  if (entry.category === "postcss") return 4;
  if (entry.category === "rsvelte") return 5;
  if (entry.category === "swc") return 6;
  if (entry.category === "yuku") return 7;
  if (entry.name.endsWith("-no-locations")) return 8; // tsv json, span-only wire
  if (entry.name.endsWith("-json")) return 9; // tsv json, loc-carrying wire
  return 10; // tsv-internal / tsv_wasm-internal — raw in-engine, no JS materialization
};

/**
 * Orders format/parse rows by their fixed `speed_entry_rank` slot, then wasm before
 * native within a tier (the browser-relevant build leads each pairing), then by name
 * — shared by the initial sort and the re-sort after disabled placeholders are mixed
 * in, so every group scans identically.
 */
const compare_speed_entries = (
  a: BenchmarkDisplayEntry,
  b: BenchmarkDisplayEntry,
): number => {
  const rank = speed_entry_rank(a) - speed_entry_rank(b);
  if (rank !== 0) return rank;
  // wasm before native within a tier
  const kind =
    (a.name.includes("wasm") ? 0 : 1) - (b.name.includes("wasm") ? 0 : 1);
  if (kind !== 0) return kind;
  return a.name.localeCompare(b.name);
};

export const derive_benchmark_groups = (
  baseline: BenchmarkBaseline,
): Array<BenchmarkGroup> => {
  const grouped: Map<string, Array<BaselineEntry>> = new Map();
  for (const entry of baseline.entries) {
    let group = grouped.get(entry.group);
    if (!group) {
      group = [];
      grouped.set(entry.group, group);
    }
    group.push(entry);
  }

  const result: Array<BenchmarkGroup> = [];

  for (const [group_key, entries] of grouped) {
    const parts = group_key.split("/");
    const operation = parts[0]!;
    const language = parts[1]!;
    // The sort below leads each group with its canonical reference (Prettier for
    // format, the JS baseline for parse), so the first row is the default 1.0x
    // anchor; the shared component reads that default off the first row and
    // recomputes every ratio, re-baselining onto whichever row is hovered. (Size
    // groups lead with their smallest build; see `derive_size_groups`.)
    // `?? 0` coerces a null timing so the display entry's `mean_ns` stays a
    // number. On a perf report the nulls are exactly the COVERAGE-ONLY rows —
    // a tool measured for what it accepts but never timed (see
    // `BenchmarkDisplayEntry.coverage_only`) — and a 0 there is inert: those
    // rows render without a bar, value, or ratio, so the coerced number is
    // never displayed or divided by. It does keep them out of `slowest`, which
    // is what we want — a row with no timing must not set the bar scale.
    const slowest = Math.max(...entries.map((e) => e.mean_ns ?? 0));

    const display_entries: Array<BenchmarkDisplayEntry> = entries.map((e) => {
      // `mean_ns` is the timing the bars and ratios are built from, so its
      // absence — not the tool's identity — is what marks a row untimed. That
      // keeps this independent of which tools happen to be coverage-only.
      const untimed = e.mean_ns == null;
      return {
        name: e.name,
        mean_ns: e.mean_ns ?? 0,
        bar_fraction: untimed || slowest <= 0 ? 0 : (e.mean_ns ?? 0) / slowest,
        category: categorize_name(e.name),
        files_processed: e.files_processed ?? null,
        files_total: e.files_total ?? null,
        ...(untimed ? { disabled: true, coverage_only: true } : null),
      };
    });

    // Fixed order (see `compare_speed_entries`): canonical leads as the default 1.0x
    // anchor, then biome, oxc, tsv's json wires, then tsv's internal engine
    display_entries.sort(compare_speed_entries);

    const iterated_counts = entries
      .map((e) => e.files_iterated)
      .filter((v): v is number => v != null);
    result.push({
      operation,
      language,
      entries: display_entries,
      canonical_entry: display_entries.find((e) => e.category === "canonical"),
      files_iterated:
        iterated_counts.length > 0 ? Math.max(...iterated_counts) : null,
    });
  }

  result.sort(
    (a, b) =>
      (OPERATION_ORDER[a.operation] ?? 9) -
        (OPERATION_ORDER[b.operation] ?? 9) ||
      (LANGUAGE_ORDER[a.language] ?? 9) - (LANGUAGE_ORDER[b.language] ?? 9),
  );

  // Neither `biome` nor (for svelte/css) `oxc-parser` has a real entry in every
  // parse group. `biome`'s `@biomejs/js-api` never exposes a parser to JS at all
  // (only formatting and linting), so no parse group has a real biome entry;
  // `oxc-parser` only parses TypeScript/JS, so the svelte and css parse groups
  // lack it. Mirror both in as disabled placeholders — biome always, oxc-parser
  // only where it's missing — then re-sort so they fall into their fixed slots
  // (biome then oxc, right after the canonical row), giving all three parse groups
  // one shared entry order.
  //
  // `yuku-parser` is deliberately NOT mirrored, though it is TypeScript/JS-only too.
  // A grayed-out slot states a SCOPE gap: biome and oxc are broad web toolchains, so
  // a missing Svelte or CSS parser is worth showing. yuku claims nothing wider, so
  // an empty slot would invent a shortfall against a promise it never made.
  const ts_parse = result.find(
    (g) => g.operation === "parse" && g.language === "typescript",
  );
  const oxc_templates =
    ts_parse?.entries.filter((e) => e.category === "oxc") ?? [];
  for (const group of result) {
    if (group.operation !== "parse") continue;
    const biome_placeholder: BenchmarkDisplayEntry = {
      name: "biome-wasm",
      mean_ns: 0,
      bar_fraction: 0,
      category: "biome",
      files_processed: null,
      files_total: null,
      disabled: true,
    };
    const needs_oxc =
      group.language !== "typescript" &&
      !group.entries.some((e) => e.category === "oxc");
    const oxc_placeholders: Array<BenchmarkDisplayEntry> = needs_oxc
      ? oxc_templates.map((e) => ({
          ...e,
          bar_fraction: 0,
          files_processed: null,
          files_total: null,
          disabled: true,
        }))
      : [];
    group.entries.push(biome_placeholder, ...oxc_placeholders);
    group.entries.sort(compare_speed_entries);
  }

  // The format-side analogue: `@dprint/typescript` formats TypeScript/JS only and
  // rejects Svelte outright, so the svelte FORMAT group has no real dprint entry.
  // Mirror it in as a disabled placeholder so the format groups share one entry
  // order, exactly as oxc-parser is mirrored into the svelte/css parse groups
  // above. css is NOT filled: the bench runs dprint's own CSS plugin, malva,
  // through the same Wasm host, and that row shares dprint's category
  // (`CATEGORY_BY_NAME`), so the "no dprint-category entry" guard below already
  // leaves it alone. Guarded on the template existing, so a report predating the
  // dprint row renders unchanged.
  const ts_format = result.find(
    (g) => g.operation === "format" && g.language === "typescript",
  );
  const dprint_templates =
    ts_format?.entries.filter((e) => e.category === "dprint") ?? [];
  if (dprint_templates.length > 0) {
    for (const group of result) {
      if (group.operation !== "format") continue;
      if (group.entries.some((e) => e.category === "dprint")) continue;
      group.entries.push(
        ...dprint_templates.map((e) => ({
          ...e,
          bar_fraction: 0,
          files_processed: null,
          files_total: null,
          disabled: true,
        })),
      );
      group.entries.sort(compare_speed_entries);
    }
  }

  return result;
};

// Parse-conformance coverage (the conformance report's headline metric)

export interface ConformanceRow {
  name: string;
  // dimmed qualifier rendered beside the name, for the one case where WHICH
  // binding produced the row is worth saying — see `CONFORMANCE_ROW_NOTES`
  note?: string;
  files_processed: number;
  files_total: number;
  // files_processed / files_total, rendered as the coverage percentage
  coverage_fraction: number;
}

export interface ConformanceGroup {
  language: string;
  // the language's total discovered files (every row shares it)
  files_total: number;
  rows: Array<ConformanceRow>;
}

/**
 * One coverage row per ENGINE, not per binding: the conformance headline is
 * "which files does this parser accept," which is identical across a tool's
 * native/wasm/internal variants — so the `-wasm` and `-internal` duplicates
 * are dropped and `tsv-json` stands in for tsv (relabeled plainly, since the
 * JSON-materialization qualifier is a speed concern, not a coverage one).
 *
 * Which binding stands in is therefore arbitrary — except for yuku, where the
 * conformance report carries the wasm row alone: its native binding crashes the
 * host process on this corpus's escaped-identifier tests, so tsv's harness omits
 * that row there. Keying on `yuku-parser` would silently drop the engine.
 */
const CONFORMANCE_ENGINE_NAMES: Record<string, string> = {
  "svelte/compiler": "svelte/compiler",
  "acorn-typescript": "acorn-typescript",
  "tsv-json": "tsv",
  "oxc-parser": "oxc-parser",
  "yuku-parser-wasm": "yuku-parser",
  // rsvelte's two parse rows are one engine under two options, so only the
  // default-wire one stands in — the option changes the payload, never the
  // verdict.
  "rsvelte-parse": "rsvelte",
  swc: "swc",
  // The TypeScript compiler's own parser, which appears on this surface alone —
  // a verdict rather than a speed, so it carries no throughput row. Its reading
  // changes by corpus source, which the note below spells out.
  tsc: "tsc",
  postcss: "PostCSS",
};

/**
 * Qualifiers rendered beside a coverage row, keyed by report entry name. The
 * table is per engine and says nothing about bindings — so a note here is for
 * when the row's reading needs a caveat the coverage number can't carry, whether
 * that's the binding or the grammar being measured.
 */
const CONFORMANCE_ROW_NOTES: Record<string, string> = {
  "yuku-parser-wasm": "wasm — native segfaults",
  // tsc selected part of this corpus, where it therefore scores 100% by
  // construction — the same shape as svelte/compiler on the Svelte set, but
  // invisible here because it holds for only a SLICE of the TypeScript group
  // rather than the whole of it. Without the note the blended number reads as
  // one achieved result, and its shortfall reads as a defect in the corpus
  // rather than as the corpora tsc never selected. Spelled out below the tables.
  tsc: "oracle for part of this corpus",
  // The CSS group's reference row is svelte/compiler's `parseCss`, which is not a
  // validity oracle in either direction — so PostCSS sitting slightly above it is
  // a grammar difference, not a conformance verdict. Spelled out in the notes
  // below the tables.
  postcss: "a different CSS grammar",
};

/**
 * Derives per-language parse-coverage groups from a conformance report
 * (`corpus_kind: 'conformance'` — parse groups only). Rows are ordered by coverage,
 * highest first; entries without coverage data are dropped.
 */
export const derive_conformance_groups = (
  baseline: BenchmarkBaseline,
): Array<ConformanceGroup> => {
  const by_language: Map<string, Array<ConformanceRow>> = new Map();
  for (const entry of baseline.entries) {
    const [operation, language] = entry.group.split("/");
    if (operation !== "parse" || !language) continue;
    const display_name = CONFORMANCE_ENGINE_NAMES[entry.name];
    if (!display_name) continue;
    if (entry.files_processed == null || entry.files_total == null) continue;
    let rows = by_language.get(language);
    if (!rows) {
      rows = [];
      by_language.set(language, rows);
    }
    rows.push({
      name: display_name,
      note: CONFORMANCE_ROW_NOTES[entry.name],
      files_processed: entry.files_processed,
      files_total: entry.files_total,
      coverage_fraction:
        entry.files_total > 0 ? entry.files_processed / entry.files_total : 0,
    });
  }

  const result: Array<ConformanceGroup> = [];
  for (const [language, rows] of by_language) {
    // coverage descending (highest acceptance first), name as a stable tiebreak
    rows.sort(
      (a, b) =>
        b.coverage_fraction - a.coverage_fraction ||
        a.name.localeCompare(b.name),
    );
    result.push({
      language,
      files_total: Math.max(0, ...rows.map((r) => r.files_total)),
      rows,
    });
  }
  result.sort(
    (a, b) =>
      (LANGUAGE_ORDER[a.language] ?? 9) - (LANGUAGE_ORDER[b.language] ?? 9),
  );
  return result;
};

/**
 * Formats a coverage fraction as a percentage with two decimals (`99.85%`),
 * FLOORED rather than rounded — rounding would render e.g. 44219/44220 as
 * `100.00%` next to a visibly non-total count. Only exact totality reads 100%
 * (matching the harness's own `coverage_pct` convention in tsv's report.ts).
 */
export const format_coverage_percent = (fraction: number): string =>
  `${(Math.floor(fraction * 10_000) / 100).toFixed(2)}%`;

export const derive_speedup_summary = (
  groups: Array<BenchmarkGroup>,
): Array<SpeedupRow> => {
  const find_speedup = (
    operation: string,
    language: string,
    primary_name: string,
  ): number | undefined => {
    const group = groups.find(
      (g) => g.operation === operation && g.language === language,
    );
    if (!group?.canonical_entry) return undefined;
    const entry = group.entries.find((e) => e.name === primary_name);
    if (!entry) return undefined;
    return group.canonical_entry.mean_ns / entry.mean_ns;
  };

  return [
    {
      variant: "native",
      format_svelte: find_speedup("format", "svelte", PRIMARY_NATIVE_FORMAT),
      format_typescript: find_speedup(
        "format",
        "typescript",
        PRIMARY_NATIVE_FORMAT,
      ),
      format_css: find_speedup("format", "css", PRIMARY_NATIVE_FORMAT),
    },
    {
      variant: "wasm",
      format_svelte: find_speedup("format", "svelte", PRIMARY_WASM_FORMAT),
      format_typescript: find_speedup(
        "format",
        "typescript",
        PRIMARY_WASM_FORMAT,
      ),
      format_css: find_speedup("format", "css", PRIMARY_WASM_FORMAT),
    },
  ];
};

// Binary-size grouping by capability

/** What a build actually does, used to group binary sizes for like-for-like comparison. */
export type SizeCapability = "full" | "formatter" | "parser";

/**
 * Capability for the labels whose NAME doesn't say what the build does, so the
 * keyword heuristic below can't reach them.
 *
 * The heuristic reads `parse`/`format`/`fmt` out of the label, which works only
 * while a tool is named after its job. These four aren't, and the fallback for an
 * unreadable label is `full` — a heading that reads "parse + format" over builds
 * that ship no formatter at all, or none but a formatter. So each one is stated
 * instead:
 *
 * - `dprint` and `malva` are the SAME kind of artifact and must land in the same
 *   bucket: both are dprint plugins loaded over the one `@dprint/formatter` host,
 *   and neither exposes a parser. dprint's covers TypeScript/JS, malva's CSS —
 *   each a slice of what tsv's format-only build does, so pair both against
 *   `tsv_format_wasm` and read the gap as scope before engine.
 * - `swc` and rsvelte's addon back parse rows and ship no formatter. Both are far
 *   wider than what the rows measure — swc's `.node` is an entire compiler
 *   (transforms, minifier, bundler) and rsvelte's carries the compiler plus
 *   svelte2tsx, HMR diffing and a resolver — so `parser` is the least-wrong
 *   heading rather than a claim of scope match. The notes beside the table say so.
 *
 * `biome` is deliberately NOT here, though its js-api exposes no parser either: the
 * bucket sizes what an ARTIFACT ships, and Biome's wasm build really is the whole
 * toolchain (parser, formatter, linter) whether or not this page calls all of it.
 * A dprint plugin is a formatter that happens to parse internally — the opposite
 * shape, and the reason it can't ride the same fallback.
 */
const SIZE_CAPABILITY_BY_LABEL: Record<string, SizeCapability> = {
  "dprint (wasm)": "formatter",
  "malva (wasm)": "formatter",
  "swc (napi)": "parser",
  "rsvelte compiler (napi)": "parser",
};

/**
 * Buckets a binary-size label by capability so each build lands next to its
 * closest competitor: `parser` (tsv's parse-only build, `oxc-parser`),
 * `formatter` (tsv's format-only build, `oxfmt`), else `full` (the flagship
 * parse+format builds, `biome`, and the combined `oxc-parser + oxfmt` entry).
 *
 * A label naming neither job is looked up in `SIZE_CAPABILITY_BY_LABEL` first —
 * the keyword read below can only answer for tools named after what they do.
 */
export const categorize_size_capability = (label: string): SizeCapability => {
  const stated = SIZE_CAPABILITY_BY_LABEL[label];
  if (stated) return stated;
  const has_parse = label.includes("parse");
  const has_format = label.includes("format") || label.includes("fmt");
  // a build that does both is a full toolchain (e.g. the combined oxc-parser + oxfmt entry)
  if (has_parse && has_format) return "full";
  if (has_parse) return "parser"; // tsv parse (ffi), tsv_parse_wasm, oxc-parser
  if (has_format) return "formatter"; // tsv format, oxfmt
  // Reaching here must be a DECISION, not a name the heuristic couldn't read:
  // every label that lands in `full` this way ships both operations (biome's whole
  // toolchain included). Anything else belongs in the table above.
  return "full"; // tsv (napi/ffi), tsv_wasm, biome (wasm)
};

export interface SizeDisplayEntry extends BinarySize {
  bar_fraction: number;
  category: ImplementationCategory;
  // a grayed-out, inert placeholder for a build that doesn't exist (e.g. oxfmt's
  // absent wasm build) — no bar, no size, just the label held in its slot. Absent
  // on real, measured entries.
  disabled?: boolean;
}

export interface SizeCapabilityGroup {
  capability: SizeCapability;
  heading: string;
  // sorted smallest-first, so the leading entry is the default ratio anchor (1.0x)
  entries: Array<SizeDisplayEntry>;
}

const SIZE_CAPABILITY_ORDER: ReadonlyArray<{
  capability: SizeCapability;
  heading: string;
}> = [
  { capability: "full", heading: "Full toolchain (parse + format)" },
  { capability: "formatter", heading: "Formatter" },
  { capability: "parser", heading: "Parser" },
];

/** Display label for the synthesized combined oxc full-toolchain build. */
export const OXC_FULL_LABEL = "oxc-parser + oxfmt (napi)";

/** Display label for oxfmt's absent wasm build placeholder — see `derive_size_groups`. */
export const OXFMT_WASM_LABEL = "oxfmt (wasm)";

/**
 * Synthesizes oxc's full-toolchain native build by summing its separately-shipped
 * parser (`oxc-parser (napi)`) and formatter (`oxfmt (napi)`) packages — together
 * they're the closest equivalent to tsv's single parse+format build, so the entry
 * stands beside `tsv (napi)` in the full-toolchain group. Returns `undefined` when
 * either half is missing (older baselines), and sums gzip only when both carry it.
 */
const synthesize_oxc_full = (
  sizes: Array<BinarySize>,
): BinarySize | undefined => {
  const parser = sizes.find((s) => s.label === "oxc-parser (napi)");
  const formatter = sizes.find((s) => s.label === "oxfmt (napi)");
  if (!parser || !formatter) return undefined;
  return {
    label: OXC_FULL_LABEL,
    bytes: parser.bytes + formatter.bytes,
    kind: "native",
    gzip_bytes:
      parser.gzip_bytes != null && formatter.gzip_bytes != null
        ? parser.gzip_bytes + formatter.gzip_bytes
        : null,
  };
};

/** The rsvelte-fmt binary on its own — the label the tsv harness emits. */
export const RSVELTE_LABEL = "rsvelte-fmt (binary)";

/** Display label for the rsvelte-fmt + oxfmt install — see `synthesize_rsvelte_install`. */
export const RSVELTE_INSTALL_LABEL = "rsvelte-fmt + oxfmt (binary)";

/**
 * Synthesizes what installing rsvelte-fmt to format a project actually costs, by
 * summing its own binary with the `oxfmt` it declares as a peer dependency.
 *
 * Both figures are shown because which one is honest depends on how you invoke
 * it, and the difference is verifiable: pointed at a **single `.svelte` file** (or
 * stdin) rsvelte-fmt needs no oxfmt at all — it formats the embedded
 * `<script>` and `<style>` through its own linked-in oxc engines, byte-identically
 * whether or not oxfmt is reachable. But pointed at a **directory** — how a
 * formatter is actually run over a project, and what the CLI benchmark times — it
 * delegates the non-`.svelte` files to oxfmt and exits non-zero without it, even
 * when that directory holds nothing but `.svelte`. So the bare binary is the
 * single-file/editor figure and the sum is the project figure.
 *
 * Returns `undefined` when either half is missing (an older baseline predating the
 * rsvelte row), and sums gzip only when both carry it — same posture as
 * `synthesize_oxc_full`.
 */
const synthesize_rsvelte_install = (
  sizes: Array<BinarySize>,
): BinarySize | undefined => {
  const rsvelte = sizes.find((s) => s.label === RSVELTE_LABEL);
  const formatter = sizes.find((s) => s.label === "oxfmt (napi)");
  if (!rsvelte || !formatter) return undefined;
  return {
    label: RSVELTE_INSTALL_LABEL,
    bytes: rsvelte.bytes + formatter.bytes,
    kind: "native",
    gzip_bytes:
      rsvelte.gzip_bytes != null && formatter.gzip_bytes != null
        ? rsvelte.gzip_bytes + formatter.gzip_bytes
        : null,
  };
};

/**
 * Groups the binary sizes by capability (full / formatter / parser), each group
 * mixing wasm and native builds sorted smallest-first. Bars scale to the group's
 * largest build; the `vs` ratio anchors on the group's single smallest build, so
 * exactly one entry reads 1.0x and every other is a multiple of it — whichever tool
 * that is. (It is not always tsv: yuku-parser's parse-only builds undercut tsv's,
 * which carry Svelte and CSS parsers besides.) A combined `oxc-parser + oxfmt` entry is
 * synthesized into the full-toolchain group, since oxc ships parse and format apart.
 * oxfmt has no wasm build, so the formatter group gets a disabled `oxfmt (wasm)`
 * placeholder slotted just above its real `oxfmt (napi)` entry, holding the slot
 * rather than omitting it. The formatter group likewise carries both rsvelte-fmt
 * figures — the bare binary and the `+ oxfmt` install it needs to format a
 * project (see `synthesize_rsvelte_install`).
 */
export const derive_size_groups = (
  sizes: Array<BinarySize>,
): Array<SizeCapabilityGroup> => {
  const oxc_full = synthesize_oxc_full(sizes);
  const rsvelte_install = synthesize_rsvelte_install(sizes);
  const all_sizes = [...sizes, oxc_full, rsvelte_install].filter(
    (s) => s != null,
  );
  const groups: Array<SizeCapabilityGroup> = [];
  for (const { capability, heading } of SIZE_CAPABILITY_ORDER) {
    const items = all_sizes.filter(
      (s) => categorize_size_capability(s.label) === capability,
    );
    if (items.length === 0) continue;
    const sorted = items.toSorted((a, b) => a.bytes - b.bytes);
    const max = Math.max(0, ...items.map((s) => s.bytes));
    // `sorted` is ascending, so the smallest build leads the group — its single
    // default ratio anchor (1.0x), one baseline whether or not the group mixes wasm
    // and native (rather than the confusing pair a per-kind anchor produced). The
    // shared component reads every ratio from that leading row.
    const entries: Array<SizeDisplayEntry> = sorted.map((s) => ({
      ...s,
      bar_fraction: max > 0 ? s.bytes / max : 0,
      category: categorize_size(s.label),
    }));
    if (
      capability === "formatter" &&
      !entries.some((e) => e.label === OXFMT_WASM_LABEL)
    ) {
      const native_index = entries.findIndex((e) => e.label === "oxfmt (napi)");
      const placeholder: SizeDisplayEntry = {
        label: OXFMT_WASM_LABEL,
        bytes: 0,
        kind: "wasm",
        gzip_bytes: null,
        bar_fraction: 0,
        category: categorize_size(OXFMT_WASM_LABEL),
        disabled: true,
      };
      entries.splice(
        native_index === -1 ? entries.length : native_index,
        0,
        placeholder,
      );
    }
    groups.push({ capability, heading, entries });
  }
  return groups;
};

// Cross-runtime combined report (the bench composer's `report.json`, `kind: 'combined'`)

export type BenchmarkRuntime = "deno" | "node" | "bun";

export interface CrossRuntimeRow {
  group: string;
  name: string;
  ops_per_second: Partial<Record<BenchmarkRuntime, number>>;
  mean_ns: Partial<Record<BenchmarkRuntime, number>>;
  files_iterated: Partial<Record<BenchmarkRuntime, number | null>>;
}

export interface CrossRuntimeReport {
  version: number;
  kind: "combined";
  generated: string;
  runtimes: Array<BenchmarkRuntime>;
  // The sibling reports came from different commits/versions — ratios are
  // unreliable until every runtime is re-run. Present from combined
  // `version` 6 on.
  mixed_vintage?: boolean;
  // The sibling reports were produced on different hardware — ratios are not
  // comparable. Present from combined `version` 7 on.
  mixed_machine?: boolean;
  // Which ROWS lost their implementation to a load failure on which runtime,
  // folded from the siblings' own `unavailable` lists. Present from combined
  // `version` 8 on (as `impls`, carrying the bench's init-line labels, which
  // matched no row name and so never joined; `rows` from `version` 9); `[]` when
  // every sibling loaded everything, and absent on older reports — which is "not
  // recorded", not a claim that nothing was missing.
  //
  // This is what tells the table's two kinds of gap apart. A row with no number
  // for a runtime renders the same either way, but it means one of: that runtime
  // couldn't load the impl behind it (recorded here), or that sibling's report
  // simply has no such row — an older run predating it, which mixed vintages make
  // likely, and which `partial_rows` below names outright.
  unavailable_by_runtime?: Array<RuntimeUnavailable>;
  // The other kind of gap: rows one sibling MEASURED that another doesn't carry at
  // all, with no load failure recorded on that side to explain it — a stale
  // sibling rather than a machine shortfall. `[]` when every row is present
  // everywhere it should be. A runtime whose sibling predates `unavailable`
  // contributes nothing (with nothing recorded, an absent row can't be told from
  // an unloadable impl). Present from combined `version` 10 on; not rendered, kept
  // for parity.
  partial_rows?: Array<PartialRow>;
  // Per-runtime deltas smaller than the combined measurement noise (cv) of the two
  // means they divide — the cells that are NOT runtime effects, despite this
  // report's subject being exactly those deltas. `[]` when every delta exceeds its
  // noise. Unlike every other field here it qualifies a number the report already
  // prints rather than adding one. Present from combined `version` 11 on; not
  // rendered, kept for parity.
  within_noise?: Array<WithinNoiseCell>;
  // The conformance report's vintage beside the perf siblings'. The composer does
  // not fold `report.conformance.node.json` (a coverage report, not a timing
  // sibling), but this site publishes it from the same directory, and
  // `mixed_vintage` above cannot see it — `stale` is that flag's perf/conformance
  // analog: the conformance commit differs from some perf sibling's. `null` when
  // the composer found no conformance report. Present from combined `version` 13
  // on; rendered as the parse-conformance section's banner.
  conformance_vintage?: ConformanceVintage | null;
  sources: Array<{
    runtime: BenchmarkRuntime;
    timestamp: string;
    git_commit: string | null;
    tsv: string | null;
    // The producing box's machine block; present from combined `version` 7 on.
    machine?: Machine | null;
    // That sibling's own load failures, with reasons; `null` when the sibling
    // predates the field. `unavailable_by_runtime` above is the folded view.
    unavailable?: Array<UnavailableImpl> | null;
  }>;
  rows: Array<CrossRuntimeRow>;
}

/** The conformance report's provenance (see `CrossRuntimeReport.conformance_vintage`). */
export interface ConformanceVintage {
  git_commit: string | null;
  timestamp: string;
  tsv: string | null;
  // The conformance commit differs from some perf sibling's.
  stale: boolean;
}

/**
 * One runtime's load failures, named by the ROWS they cost (`bun` → `biome-wasm`,
 * `oxc-parser-wasm`) — the identity the tables are keyed by, so a lookup can match.
 */
export interface RuntimeUnavailable {
  runtime: BenchmarkRuntime;
  rows: Array<string>;
}

/**
 * One row a sibling measured and the runtimes in `missing` don't carry, with no
 * load failure recorded there to explain it (see `CrossRuntimeReport.partial_rows`).
 */
export interface PartialRow {
  group: string;
  name: string;
  missing: Array<BenchmarkRuntime>;
}

/**
 * One per-runtime cell whose delta is inside the two measurements' combined
 * variation (see `CrossRuntimeReport.within_noise`). `delta` and `noise` are
 * fractions, not percentages.
 */
export interface WithinNoiseCell {
  group: string;
  name: string;
  runtime: BenchmarkRuntime;
  delta: number;
  noise: number;
}

/**
 * The rows each runtime couldn't measure, in the site's column order, for the
 * disclosure above the tables. Empty when nothing was recorded — including on a
 * report predating the field, where absence is silence rather than an all-clear.
 */
export const derive_unavailable_by_runtime = (
  report: CrossRuntimeReport,
): Array<RuntimeUnavailable> => {
  const by_runtime = new Map(
    (report.unavailable_by_runtime ?? []).map((entry) => [
      entry.runtime,
      entry,
    ]),
  );
  return order_cross_runtime_runtimes(report.runtimes)
    .map((runtime) => by_runtime.get(runtime))
    .filter(
      (entry): entry is RuntimeUnavailable =>
        entry != null && entry.rows.length > 0,
    );
};

/**
 * Did `runtime` record `name` as a load failure? The table renders an absent
 * number the same either way, so this is what lets a cell say WHICH gap it is —
 * a binding that couldn't load, or a row that runtime's report never carried.
 */
export const is_impl_unavailable = (
  report: CrossRuntimeReport,
  runtime: BenchmarkRuntime,
  name: string,
): boolean =>
  (report.unavailable_by_runtime ?? []).some(
    (entry) => entry.runtime === runtime && entry.rows.includes(name),
  );

export interface CrossRuntimeDisplayRow {
  name: string;
  category: ImplementationCategory;
  ops_per_second: Partial<Record<BenchmarkRuntime, number>>;
  // ratio of each runtime vs the base (first present) runtime; `> 1` = faster
  ratio_vs_base: Partial<Record<BenchmarkRuntime, number>>;
  // The per-runtime timed file counts, set ONLY when they disagree — each
  // runtime times the files its own impls passed preflight on, so unequal
  // counts mean part of this row's ratio is file-set composition, not runtime
  // (the composer's `⚠ files a/b/c` annotation in tsv's report.md). `null`
  // when every present runtime timed the same count — the healthy, common case.
  files_iterated_mismatch: Partial<
    Record<BenchmarkRuntime, number | null>
  > | null;
}

export interface CrossRuntimeGroup {
  group: string;
  operation: string;
  language: string;
  rows: Array<CrossRuntimeDisplayRow>;
}

// The combined report stores runtimes deno-first (matching the bench's
// `report.md`); the site presents them node-first (the flagship N-API runtime),
// then deno, then bun.
const CROSS_RUNTIME_DISPLAY_ORDER: Array<BenchmarkRuntime> = [
  "node",
  "deno",
  "bun",
];

/**
 * The report's runtimes in the site's display order — node (the flagship, the
 * ratio anchor) first, then deno, then bun. Shared by `derive_cross_runtime_groups`
 * and the table headers so the anchor can't drift between them.
 */
export const order_cross_runtime_runtimes = (
  runtimes: Array<BenchmarkRuntime>,
): Array<BenchmarkRuntime> =>
  CROSS_RUNTIME_DISPLAY_ORDER.filter((r) => runtimes.includes(r));

/** One runtime's own version string (`node 24.14.1`), for the cross-runtime section. */
export interface RuntimeVersion {
  runtime: BenchmarkRuntime;
  version: string;
}

/**
 * The per-runtime version strings from a cross-runtime report, in the site's
 * display order (node first). Drops any runtime whose source carries no machine
 * block (reports predating combined `version` 7). The cross-runtime section
 * renders these so the three-runtime tables disclose which node/deno/bun version
 * each column was measured under; the environment panel above stays scoped to the
 * flagship Node baseline. The shared hardware identity (CPU/OS/arch) isn't
 * repeated here — it lives in the environment panel, and a per-runtime hardware
 * mismatch is the report's `mixed_machine` flag's concern.
 */
export const derive_runtime_versions = (
  report: CrossRuntimeReport,
): Array<RuntimeVersion> => {
  const by_runtime = new Map(
    report.sources.map((source) => [source.runtime, source]),
  );
  const result: Array<RuntimeVersion> = [];
  for (const runtime of order_cross_runtime_runtimes(report.runtimes)) {
    const version = by_runtime.get(runtime)?.machine?.runtime_version;
    if (version) result.push({ runtime, version });
  }
  return result;
};

/**
 * Groups the combined report's rows by benchmark group, in the same display
 * order as `derive_benchmark_groups` (format before parse, then svelte /
 * typescript / css). The ratio base is the first runtime in display order
 * (node when present — the flagship N-API path), regardless of the report's
 * own deno-first storage order.
 */
export const derive_cross_runtime_groups = (
  report: CrossRuntimeReport,
): Array<CrossRuntimeGroup> => {
  const runtimes = order_cross_runtime_runtimes(report.runtimes);
  const base = runtimes[0];
  const grouped: Map<string, Array<CrossRuntimeDisplayRow>> = new Map();
  for (const row of report.rows) {
    let rows = grouped.get(row.group);
    if (!rows) {
      rows = [];
      grouped.set(row.group, rows);
    }
    const base_ops = base ? row.ops_per_second[base] : undefined;
    const ratio_vs_base: Partial<Record<BenchmarkRuntime, number>> = {};
    for (const runtime of runtimes) {
      const ops = row.ops_per_second[runtime];
      if (ops != null && base_ops != null && base_ops > 0) {
        ratio_vs_base[runtime] = ops / base_ops;
      }
    }
    const iterated_counts = runtimes
      .map((runtime) => row.files_iterated[runtime])
      .filter((n): n is number => n != null);
    rows.push({
      name: row.name,
      category: categorize_name(row.name),
      ops_per_second: row.ops_per_second,
      ratio_vs_base,
      files_iterated_mismatch:
        new Set(iterated_counts).size > 1 ? row.files_iterated : null,
    });
  }

  const result: Array<CrossRuntimeGroup> = [];
  for (const [group, rows] of grouped) {
    const [operation, language] = group.split("/");
    result.push({ group, operation: operation!, language: language!, rows });
  }
  result.sort(
    (a, b) =>
      (OPERATION_ORDER[a.operation] ?? 9) -
        (OPERATION_ORDER[b.operation] ?? 9) ||
      (LANGUAGE_ORDER[a.language] ?? 9) - (LANGUAGE_ORDER[b.language] ?? 9),
  );
  return result;
};

// Formatting utilities

export interface FormattedUnit {
  value: string;
  unit: string;
}

export const format_ns = (ns: number): FormattedUnit => {
  if (ns < 1_000) return { value: `${Math.round(ns)}`, unit: "ns" };
  if (ns < 1_000_000)
    return {
      value: (ns / 1_000).toFixed(ns < 10_000 ? 2 : ns < 100_000 ? 1 : 0),
      unit: "µs",
    };
  const ms = Math.round(ns / 1_000_000);
  return { value: ms.toLocaleString("en-US"), unit: "ms" };
};

export const format_bytes = (bytes: number): FormattedUnit => {
  if (bytes < 1_024) return { value: `${bytes}`, unit: "B" };
  if (bytes < 1_048_576)
    return { value: (bytes / 1_024).toFixed(0), unit: "KB" };
  return { value: (bytes / 1_048_576).toFixed(1), unit: "MB" };
};

/**
 * Formats a corpus source's file count as a per-language breakdown
 * (`124 typescript, 15 svelte, 31 css`), largest language first and dropping
 * zero-count languages. Falls back to the plain `N files` total when the report
 * predates the per-language split (or lists no recognized language).
 */
export const format_corpus_source_files = (source: CorpusSource): string => {
  const total = `${source.files.toLocaleString("en-US")} files`;
  if (!source.by_language) return total;
  const parts = Object.entries(source.by_language)
    .filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => `${count.toLocaleString("en-US")} ${language}`);
  return parts.length > 0 ? parts.join(", ") : total;
};

// Corpus source repos (site-owned path → URL mapping)

export interface CorpusRepo {
  // public repo URL the entry links to
  url: string;
  // `org/name`, derived from the URL — the linkified display label
  label: string;
}

/**
 * Maps a corpus source's on-disk path to its public repo URL. The bench records
 * only local paths (`../zzz/src`), so the site owns this mapping — the links then
 * survive an `update-benchmarks` refresh without touching the copied JSON. Keyed by
 * the repo's directory prefix, each ending in a slash so siblings like `../fuz_css/`
 * and `../fuz_code/`, and `../svelte/` vs `../svelte.dev/`, stay distinct. A source
 * matching no prefix — the derived `svelte_styles` CSS cache, which isn't a single
 * repo — is dropped from the repos list rather than shown unlinked.
 */
const CORPUS_REPO_URL_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ["../zzz/", "https://github.com/fuzdev/zzz"],
  ["../fuz_app/", "https://github.com/fuzdev/fuz_app"],
  ["../fuz_blog/", "https://github.com/fuzdev/fuz_blog"],
  ["../fuz_code/", "https://github.com/fuzdev/fuz_code"],
  ["../fuz_css/", "https://github.com/fuzdev/fuz_css"],
  ["../fuz_docs/", "https://github.com/fuzdev/fuz_docs"],
  ["../fuz_gitops/", "https://github.com/fuzdev/fuz_gitops"],
  ["../fuz_mastodon/", "https://github.com/fuzdev/fuz_mastodon"],
  ["../fuz_template/", "https://github.com/fuzdev/fuz_template"],
  ["../fuz_ui/", "https://github.com/fuzdev/fuz_ui"],
  ["../fuz_util/", "https://github.com/fuzdev/fuz_util"],
  ["../mdz/", "https://github.com/fuzdev/mdz"],
  ["../gro/", "https://github.com/fuzdev/gro"],
  ["../svelte-docinfo/", "https://github.com/fuzdev/svelte-docinfo"],
  ["../tsv.fuz.dev/", "https://github.com/fuzdev/tsv.fuz.dev"],
  ["../ryanatkn.com/", "https://github.com/ryanatkn/ryanatkn.com"],
  ["../webdevladder.net/", "https://github.com/ryanatkn/webdevladder.net"],
  ["../kit/", "https://github.com/sveltejs/kit"],
  ["../svelte.dev/", "https://github.com/sveltejs/svelte.dev"],
  ["../svelte/", "https://github.com/sveltejs/svelte"],
];

/** The repo URL for a corpus source path, or `undefined` when it maps to no repo. */
const corpus_repo_url = (path: string): string | undefined =>
  CORPUS_REPO_URL_BY_PREFIX.find(([prefix]) => path.startsWith(prefix))?.[1];

/** `org/name` from a `https://github.com/org/name` URL — the linkified label. */
const corpus_repo_label = (url: string): string =>
  new URL(url).pathname.slice(1);

/**
 * The distinct source repos behind a report's corpus, one entry per URL in
 * first-seen order (the author's ecosystem leads, the upstream framework repos
 * trail, matching the source order). Sources sharing a repo (svelte.dev's several
 * packages) collapse to one entry; sources with no mapped repo (the `svelte_styles`
 * CSS cache) are dropped. URLs come from the site-owned `CORPUS_REPO_URL_BY_PREFIX`,
 * not the report, so the links survive a refresh.
 */
export const derive_corpus_repos = (
  sources: Array<CorpusSource> | undefined,
): Array<CorpusRepo> => {
  const by_url: Map<string, CorpusRepo> = new Map();
  for (const source of sources ?? []) {
    // Prefer the report's git-detected repo; fall back to the legacy prefix
    // map for reports predating `version` 8 (which lack `source.repo`).
    const url = source.repo?.url ?? corpus_repo_url(source.path);
    if (!url || by_url.has(url)) continue;
    by_url.set(url, {
      url,
      label: source.repo?.slug ?? corpus_repo_label(url),
    });
  }
  return [...by_url.values()];
};

/**
 * Formats a gzipped binary size as a bar annotation (e.g. `716.6 KB gz`), or
 * `undefined` when the baseline lacks it (older runs, or no `gzip` available
 * on the generating machine).
 */
export const format_gzip_size = (
  gzip_bytes: number | null | undefined,
): string | undefined => {
  if (gzip_bytes == null) return undefined;
  const { value, unit } = format_bytes(gzip_bytes);
  return `${value} ${unit} gz`;
};

/** Matches the bench report generator's ratio formatting so the site and report.md agree digit for digit. */
export const format_speedup = (ratio: number): string =>
  ratio >= 10 ? `${ratio.toFixed(1)}x` : `${ratio.toFixed(2)}x`;

/**
 * Loose ratio formatting for prose, which reads better with fewer digits than a
 * table column (`1.7x`, `26x`) — always paired with a `~` in the copy. Renders
 * `—` for a missing ratio rather than throwing mid-sentence; the benchmark tests
 * assert every ratio the page quotes actually resolves.
 */
export const format_ratio_approx = (ratio: number | undefined): string =>
  ratio === undefined
    ? "—"
    : ratio >= 10
      ? `${Math.round(ratio)}x`
      : `${ratio.toFixed(1)}x`;

/**
 * An inclusive ratio range for prose (`3–9x`), FLOORED at both ends so a
 * "3–9x less memory" claim never overstates either bound.
 */
export const format_ratio_range = (min: number, max: number): string =>
  `${Math.floor(min)}–${Math.floor(max)}x`;

/**
 * A bracketing ratio range for prose (`4–5x`) — the min FLOORED and the max
 * CEILED, so the stated integer range always contains the true range: the low
 * end ("at least") is never overstated, and only the soft "up to" end rounds
 * outward. Always paired with a `~` in the copy. Use `format_ratio_range` when
 * neither bound may overstate; this one reads better when flooring both would
 * collapse the range.
 */
export const format_ratio_range_approx = (min: number, max: number): string =>
  `${Math.floor(min)}–${Math.ceil(max)}x`;

/**
 * How many times faster `faster` is than `slower` within one `operation/language`
 * group, by mean time — the ratio the prose summaries quote.
 *
 * @returns the ratio, or `undefined` when either entry is absent from the report
 */
export const benchmark_speedup = (
  baseline: BenchmarkBaseline,
  group: string,
  slower: string,
  faster: string,
): number | undefined => {
  const find = (name: string) =>
    baseline.entries.find((e) => e.group === group && e.name === name);
  // a coverage-only report carries null timings, so both sides must be real
  const a = find(slower)?.mean_ns;
  const b = find(faster)?.mean_ns;
  if (a == null || !b) return undefined;
  return a / b;
};

/**
 * Signed speedup: entries at or above the anchor read as a plain multiple
 * (`2.50x`), while slower entries show the reciprocal negated (`0.15x` → `-6.67x`)
 * so "how many times slower" is directly legible instead of a fraction the reader
 * has to invert. The minus is a convention for "times slower", not a literal
 * negative rate. Used for the format/parse speed bars, where entries span widely
 * on both sides of the anchor; the near-parity cross-runtime table and the
 * bigger-is-worse size ratios stay on the plain fractional `format_speedup`.
 */
export const format_speedup_signed = (ratio: number): string => {
  const magnitude = ratio >= 1 ? ratio : 1 / ratio;
  const digits = magnitude >= 10 ? 1 : 2;
  return `${ratio < 1 ? "-" : ""}${magnitude.toFixed(digits)}x`;
};

/** Hyphenated tool names that should preserve their hyphens in display labels. */
const HYPHENATED_NAMES = [
  "acorn-typescript",
  "oxc-parser",
  "rsvelte-fmt",
  "yuku-parser",
];

/**
 * Display labels for the raw benchmark entry names in the main (Node) tables,
 * annotating each with the runtime **and** binding it runs under — the native
 * builds load the N-API addon under Node, so they read `(node napi)` to
 * distinguish them from the Deno FFI numbers the cross-runtime table surfaces
 * (`tsv (deno ffi)`); the third-party wasm builds are marked `(wasm)`. Mirrors
 * the parenthesized suffixes the binary-size section's labels already carry.
 * tsv's own wasm entries keep their `tsv_wasm` package-name style, as in the size
 * groups, so they aren't listed here. The already-parenthesized size labels
 * aren't keys, so they fall through to the generic formatting below unchanged.
 * The cross-runtime table neutralizes the `(node napi)` suffix per row (its
 * columns span runtimes) via `format_cross_runtime_label`.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  tsv: "tsv (node napi)",
  "tsv-json": "tsv json (node napi)",
  // `no-locs` (not `no-locations`) — the full word eats too much column width.
  "tsv-json-no-locations": "tsv json no-locs (node napi)",
  // the one tsv_wasm entry listed here: the generic formatting below would
  // break the `no-locs` hyphen its native sibling deliberately keeps
  "tsv_wasm-json-no-locations": "tsv_wasm json no-locs",
  "tsv-internal": "tsv internal (node napi)",
  "oxc-parser": "oxc-parser (node napi)",
  oxfmt: "oxfmt (node napi)",
  "biome-wasm": "biome (wasm)",
  "dprint-wasm": "dprint (wasm)",
  "malva-wasm": "malva (wasm)",
  "oxc-parser-wasm": "oxc-parser (wasm)",
  "yuku-parser": "yuku-parser (node napi)",
  "yuku-parser-wasm": "yuku-parser (wasm)",
  swc: "swc (node napi)",
  // both rsvelte parse rows are the same N-API addon, distinguished by the option
  // the second one passes — kept in the label, since that option IS the row
  "rsvelte-parse": "rsvelte-parse (node napi)",
  "rsvelte-parse-skip-expr-loc": "rsvelte-parse skip-expr-loc (node napi)",
  // `postcss` needs no entry: it's plain JS with no binding to name, like `prettier`
};

export const format_label = (name: string): string => {
  const override = LABEL_OVERRIDES[name];
  if (override) return override;
  for (const tool of HYPHENATED_NAMES) {
    if (name.startsWith(tool)) {
      return tool + name.slice(tool.length).replaceAll("-", " ");
    }
  }
  return name.replaceAll("-", " ");
};

/**
 * The label for a cross-runtime row. Each row spans node/deno/bun columns, and a
 * native build's binding is runtime-specific (N-API on node & bun, C-FFI on
 * deno), so the row can't pin one binding — neutralize `format_label`'s
 * node-centric `(node napi)` suffix to `(native)`. The per-runtime binding is
 * disclosed once in the table caption instead (see `BenchmarksCrossRuntime`).
 */
export const format_cross_runtime_label = (name: string): string =>
  format_label(name).replace(" (node napi)", " (native)");

/** Returns a CSS background color variable for a category. */
export const category_color = (category: ImplementationCategory): string => {
  switch (category) {
    case "canonical":
      return "var(--color_h_40)";
    case "tsv_native":
      return "var(--color_g_40)";
    case "tsv_native_json":
      return "var(--color_e_40)";
    case "tsv_wasm":
      return "var(--color_d_40)";
    case "tsv_wasm_json":
      return "var(--color_f_40)";
    case "biome":
      return "var(--color_a_40)";
    case "dprint":
      return "var(--color_b_40)";
    case "oxc":
      return "var(--color_i_40)";
    case "rsvelte":
      return "var(--color_c_40)";
    case "yuku":
      return "var(--color_j_40)";
    // The palette has ten hues and the categories above spend all ten, so these
    // two reuse a hue at a lighter shade. The pairing is chosen so a collision
    // can't show up in a speed group: `swc` and `postcss` are parse-only, while
    // `biome` and `dprint` are format-only, and placeholder rows mirror only
    // within an operation. They DO meet in the binary-size table, which lists
    // both operations' tools — hence the distinct shade rather than a bare reuse.
    // A future biome/dprint parse row (or an swc formatter) would break that, and
    // would need a real hue freed up.
    case "swc":
      return "var(--color_a_50)"; // biome's hue, lighter
    case "postcss":
      return "var(--color_b_50)"; // dprint's hue, lighter
  }
};

/**
 * Returns a CSS color variable for a size ratio (inverted — bigger is worse).
 * Green is reserved for builds smaller than the baseline (ratio < 1, only reachable
 * once a hover re-baselines onto a larger build); any build at or above the baseline
 * reads yellow at the floor, ramping through orange to red as it grows.
 */
const size_ratio_color = (ratio: number): string => {
  if (ratio < 1) return "var(--color_b_50)"; // green — smaller than baseline
  if (ratio < 3) return "var(--color_e_50)"; // yellow — larger
  if (ratio < 10) return "var(--color_h_50)"; // orange — much larger
  return "var(--color_c_50)"; // red — enormous
};

/** Returns a CSS color variable for the speedup ratio. */
const speedup_color = (ratio: number): string => {
  if (ratio < 0.5) return "var(--color_c_50)"; // red — much slower
  if (ratio < 1) return "var(--color_h_50)"; // orange — slower
  if (ratio < 2) return "var(--color_e_50)"; // yellow — modest
  if (ratio < 5) return "var(--color_b_50)"; // green — fast
  return "var(--color_j_50)"; // teal — exceptional
};

/**
 * Cross-runtime ratio cell background: a stable fuz_css red (`color_c`) / green
 * (`color_b`) whose ALPHA varies with distance from parity. Fully transparent at ratio
 * `1.0` (parity recedes), ramping to `0.3` alpha at ratio `0.8` and below (red) or `1.2`
 * and above (green). The hue stays constant — only opacity moves — so it reads
 * consistently in light and dark themes while the cell's text keeps the default color.
 * Deliberately its own scale — NOT the shared `speedup_color` — because cross-runtime
 * deltas cluster tightly near 1.0 and this must not bleed into the other displays.
 */
export const cross_runtime_ratio_background = (ratio: number): string => {
  // 0 alpha at ratio 1.0, up to 0.3 at ratio ≤ 0.8 (red) or ≥ 1.2 (green)
  const alpha = Math.min(1, Math.abs(ratio - 1) / 0.2) * 0.3;
  const color = ratio < 1 ? "var(--color_c_50)" : "var(--color_b_50)";
  return `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(1)}%, transparent)`;
};

// Interactive baseline (hover-to-rebaseline)

/**
 * Which way a group's ratio runs, so re-anchoring on hover stays consistent. A
 * `speed` group (format/parse) reads its anchor as a reference speed — faster
 * entries are positive multiples, slower ones negative (`format_speedup_signed` /
 * `speedup_color`). A `size` group reads its anchor as a reference size — bigger
 * builds are multiples ≥ 1 (`format_size_ratio` / `size_ratio_color`). The two
 * ratios are reciprocals, which is exactly why one direction flag suffices.
 */
export type BaselineDirection = "speed" | "size";

/** An entry's ratio against its group's anchor, in the group's direction. */
export const compute_baseline_ratio = (
  direction: BaselineDirection,
  entry_raw: number,
  anchor_raw: number,
): number =>
  direction === "speed" ? anchor_raw / entry_raw : entry_raw / anchor_raw;

/** Plain size ratio (`2.3x`) — its own formatter since sizes never take the signed treatment. */
const format_size_ratio = (ratio: number): string => `${ratio.toFixed(1)}x`;

/** Formats a baseline ratio for display in the given direction. */
export const format_baseline_ratio = (
  direction: BaselineDirection,
  ratio: number,
): string =>
  direction === "speed"
    ? format_speedup_signed(ratio)
    : format_size_ratio(ratio);

/** Color for a baseline ratio in the given direction. */
export const baseline_ratio_color = (
  direction: BaselineDirection,
  ratio: number,
): string =>
  direction === "speed" ? speedup_color(ratio) : size_ratio_color(ratio);

/**
 * A normalized row for `BenchmarksBaselineGroup` — the shared hover-to-rebaseline
 * column behind the format, parse, and binary-size groups. `raw` is the number the
 * ratio derives from (sweep mean ns for speed, bytes for size); `value` is the
 * row's displayed measurement (the whole-sweep mean — total time over the group's
 * iterated corpus — for speed, bytes for size). Flattening the group-specific
 * display entries to this one shape lets a single component own the anchor state
 * for all three sections.
 */
export interface BaselineRow {
  // stable identity for `#each` and anchor matching (the entry name / size label)
  key: string;
  // raw name/label; `BenchmarksBar` formats it for display
  label: string;
  category: ImplementationCategory;
  bar_fraction: number;
  value: FormattedUnit;
  // the number the ratio derives from — mean ns (speed) or bytes (size)
  raw: number;
  annotation: string | undefined;
  // grayed-out, inert placeholder — never an anchor, no hover highlight
  disabled: boolean;
  // inert because the tool was measured for COVERAGE but deliberately never
  // timed, not because it sat the group out — the bar reads `not timed` instead
  // of `n/a` so the two aren't conflated. See `BenchmarkDisplayEntry.coverage_only`.
  coverage_only?: boolean;
}
