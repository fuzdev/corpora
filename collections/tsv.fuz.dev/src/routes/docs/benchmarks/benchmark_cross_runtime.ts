// The combined cross-runtime report (the bench composer's `report.json`,
// `kind: 'combined'`) — its types, derivations, and display helpers. The
// per-runtime reports it composes live in `benchmark_data.ts`.

import {
	categorize_row,
	compare_group_order,
	parse_group_key,
	type ImplementationCategory,
	type Machine,
	type UnavailableImpl
} from './benchmark_data.ts';
import { format_label } from './benchmark_display.ts';

export type BenchmarkRuntime = 'deno' | 'node' | 'bun';

export interface CrossRuntimeRow {
	group: string;
	// From combined `version` 16, `tsv` / `tsv-wasm` name the default parse rows as
	// well as the format ones, so a row is keyed on `group` + `name`, never the name alone.
	name: string;
	ops_per_second: Partial<Record<BenchmarkRuntime, number>>;
	mean_ns: Partial<Record<BenchmarkRuntime, number>>;
	files_iterated: Partial<Record<BenchmarkRuntime, number | null>>;
}

export interface CrossRuntimeReport {
	version: number;
	kind: 'combined';
	generated: string;
	runtimes: Array<BenchmarkRuntime>;
	// The sibling reports came from different commits/versions — ratios are
	// unreliable until every runtime is re-run. The shape tests forbid a committed
	// report from setting it, so it isn't rendered.
	mixed_vintage: boolean;
	// The sibling reports were produced on different hardware — ratios are not
	// comparable.
	mixed_machine: boolean;
	// Which ROWS lost their implementation to a load failure on which runtime,
	// folded from the siblings' own `unavailable` lists; `[]` when every sibling
	// loaded everything.
	//
	// This is what tells the table's two kinds of gap apart. A row with no number
	// for a runtime renders the same either way, but it means one of: that runtime
	// couldn't load the impl behind it (recorded here), or that sibling's report
	// simply has no such row — an older run predating it, which mixed vintages make
	// likely, and which `partial_rows` below names outright.
	unavailable_by_runtime: Array<RuntimeUnavailable>;
	// The other kind of gap: rows one sibling MEASURED that another doesn't carry at
	// all, with no load failure recorded on that side to explain it — a stale
	// sibling rather than a machine shortfall. `[]` when every row is present
	// everywhere it should be. A runtime whose sibling predates `unavailable`
	// contributes nothing (with nothing recorded, an absent row can't be told from
	// an unloadable impl). Not rendered, kept for parity.
	partial_rows: Array<PartialRow>;
	// Per-runtime deltas smaller than the combined measurement noise of the two means
	// they divide — the cells that are NOT runtime effects, despite this report's
	// subject being exactly those deltas. Each side's noise is the spread of its
	// row's pass means where the row was timed in several fresh processes (combined
	// `version` 18+), else its cleaned cv (see `WithinNoiseCell.basis`). `[]` when every delta exceeds its
	// noise. Unlike every other field here it qualifies a number the report already
	// prints rather than adding one. Rendered as a `≈` on the ratio cell (see
	// `is_ratio_within_noise`).
	within_noise: Array<WithinNoiseCell>;
	// Per-runtime measurements that were NOT stable — a cleaned cv past 10%, a raw cv
	// past 10% on a row with fewer than 30 raw timings a pass, a |drift| past 5%, or a
	// pass spread past 5% — collected ahead of `within_noise`'s sample gate, so a
	// row measured on five timings that disagree is named rather than silenced.
	// Every ratio through such a cell is unreadable. `[]` when every measurement was
	// stable. Rendered as a banner over the cross-runtime tables and a `⚠` on the cell.
	unstable_cells: Array<UnstableCell>;
	// The conformance report's vintage beside the perf siblings'. The composer does
	// not fold `report.conformance.node.json` (a coverage report, not a timing
	// sibling), but this site publishes it from the same directory, and
	// `mixed_vintage` above cannot see it — `stale` is that flag's perf/conformance
	// analog: the conformance commit differs from some perf sibling's. `null` when
	// the composer found no conformance report. The shape tests forbid a committed
	// report from being stale, so it isn't rendered.
	conformance_vintage: ConformanceVintage | null;
	sources: Array<{
		runtime: BenchmarkRuntime;
		timestamp: string;
		git_commit: string | null;
		tsv: string | null;
		// The `fuzdev/corpora` commit that sibling's real-code corpus was read from —
		// a third axis of `mixed_vintage`, since the bench reads whatever snapshot is
		// checked out. `null` when the sibling predates its own `corpus_snapshot` field.
		corpus_snapshot: string | null;
		// The producing box's machine block.
		machine: Machine | null;
		// That sibling's own load failures, with reasons; `null` when the sibling
		// predates the field. `unavailable_by_runtime` above is the folded view.
		unavailable: Array<UnavailableImpl> | null;
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
	// The two runtimes the cell divides, in the composer's canonical order — always
	// exactly two, typed as an array rather than a pair because the report arrives
	// as a JSON import, whose arrays never infer as tuples. Not rendered.
	runtimes: Array<BenchmarkRuntime>;
	delta: number;
	noise: number;
	// What each side's noise was read from, in `runtimes` order: `passes` (the spread
	// of the row's pass means) or `sweeps` (its cleaned cv). Absent before combined
	// `version` 18, where every side was `sweeps`. Not rendered.
	basis?: Array<'passes' | 'sweeps'>;
	// Each side's count in its `basis` unit — passes, or cleaned sweeps — in
	// `runtimes` order (an array, not a pair, for the same JSON-import reason). Not
	// rendered.
	samples: Array<number>;
}

/**
 * One per-runtime measurement that was not stable (see
 * `CrossRuntimeReport.unstable_cells`). `cv`, `cv_raw`, `drift` and `pass_spread`
 * are fractions; each but `cv` is `null` on a sibling predating it.
 */
export interface UnstableCell {
	group: string;
	name: string;
	runtime: BenchmarkRuntime;
	cv: number | null;
	cv_raw: number | null;
	drift: number | null;
	// The row's slowest pass mean over its fastest, minus one — each pass a fresh
	// process. Absent before combined `version` 17.
	pass_spread?: number | null;
	/** The cleaned timing count behind the cv (`samples` in the composer's JSON). */
	samples: number | null;
}

export interface CrossRuntimeDisplayRow {
	name: string;
	category: ImplementationCategory;
	ops_per_second: Partial<Record<BenchmarkRuntime, number>>;
	// the mean time of one sweep per runtime, the unit the tables print
	mean_ns: Partial<Record<BenchmarkRuntime, number>>;
	// ratio of each runtime vs the base (first present) runtime; `> 1` = faster
	ratio_vs_base: Partial<Record<BenchmarkRuntime, number>>;
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
const CROSS_RUNTIME_DISPLAY_ORDER: Array<BenchmarkRuntime> = ['node', 'deno', 'bun'];

/**
 * The report's runtimes in the site's display order — node (the flagship, the
 * ratio anchor) first, then deno, then bun. Shared by `derive_cross_runtime_groups`
 * and the table headers so the anchor can't drift between them.
 */
export const order_cross_runtime_runtimes = (
	runtimes: Array<BenchmarkRuntime>
): Array<BenchmarkRuntime> => CROSS_RUNTIME_DISPLAY_ORDER.filter((r) => runtimes.includes(r));

/** A runtime where one row of a group leads another — see `derive_runtime_leads`. */
export interface RuntimeLead {
	runtime: BenchmarkRuntime;
	/** How many times faster `faster` is than `slower` under this runtime. */
	ratio: number;
	/** How many times slower `slower` runs here than under the base runtime. */
	slower_vs_base: number;
}

/**
 * The runtimes, other than `base`, where `faster` leads `slower` within one group,
 * in the site's display order — what lets a claim made from the base runtime's
 * report say where it flips. Empty when either row lacks a time under a runtime.
 */
export const derive_runtime_leads = (
	report: CrossRuntimeReport,
	group: string,
	slower: string,
	faster: string,
	base: BenchmarkRuntime = 'node'
): Array<RuntimeLead> => {
	const find = (name: string) => report.rows.find((r) => r.group === group && r.name === name);
	const slower_row = find(slower);
	const faster_row = find(faster);
	if (!slower_row || !faster_row) return [];
	const leads: Array<RuntimeLead> = [];
	for (const runtime of order_cross_runtime_runtimes(report.runtimes)) {
		if (runtime === base) continue;
		const slower_ns = slower_row.mean_ns[runtime];
		const faster_ns = faster_row.mean_ns[runtime];
		const slower_base_ns = slower_row.mean_ns[base];
		if (!slower_ns || !faster_ns || !slower_base_ns || slower_ns <= faster_ns) continue;
		leads.push({
			runtime,
			ratio: slower_ns / faster_ns,
			slower_vs_base: slower_ns / slower_base_ns
		});
	}
	return leads;
};

/** One runtime's own version string (`node 24.14.1`), for the cross-runtime section. */
export interface RuntimeVersion {
	runtime: BenchmarkRuntime;
	version: string;
}

/**
 * The per-runtime version strings from a cross-runtime report, in the site's
 * display order (node first). Drops any runtime whose source carries no machine
 * block. The cross-runtime section
 * renders these so the three-runtime tables disclose which node/deno/bun version
 * each column was measured under; the environment panel above stays scoped to the
 * flagship Node baseline. The shared hardware identity (CPU/OS/arch) isn't
 * repeated here — it lives in the environment panel, and a per-runtime hardware
 * mismatch is the report's `mixed_machine` flag's concern.
 */
export const derive_runtime_versions = (report: CrossRuntimeReport): Array<RuntimeVersion> => {
	const by_runtime = new Map(report.sources.map((source) => [source.runtime, source]));
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
	report: CrossRuntimeReport
): Array<CrossRuntimeGroup> => {
	const runtimes = order_cross_runtime_runtimes(report.runtimes);
	const base = runtimes[0];
	const to_display_row = (row: CrossRuntimeRow): CrossRuntimeDisplayRow => {
		const base_ops = base ? row.ops_per_second[base] : undefined;
		const ratio_vs_base: Partial<Record<BenchmarkRuntime, number>> = {};
		for (const runtime of runtimes) {
			const ops = row.ops_per_second[runtime];
			if (ops != null && base_ops != null && base_ops > 0) {
				ratio_vs_base[runtime] = ops / base_ops;
			}
		}
		return {
			name: row.name,
			category: categorize_row(row.group, row.name),
			ops_per_second: row.ops_per_second,
			mean_ns: row.mean_ns,
			ratio_vs_base
		};
	};

	return [...Map.groupBy(report.rows, (row) => row.group)]
		.map(([group, rows]) => ({ group, ...parse_group_key(group), rows: rows.map(to_display_row) }))
		.sort(compare_group_order);
};

/**
 * The combined report's unstable cells, in the site's runtime column order.
 */
export const derive_unstable_cells = (report: CrossRuntimeReport): Array<UnstableCell> => {
	const order = order_cross_runtime_runtimes(report.runtimes);
	return [...report.unstable_cells].sort(
		(a, b) => order.indexOf(a.runtime) - order.indexOf(b.runtime)
	);
};

/**
 * The rows each runtime couldn't measure, in the site's column order, for the
 * disclosure above the tables. Empty when nothing was recorded.
 */
export const derive_unavailable_by_runtime = (
	report: CrossRuntimeReport
): Array<RuntimeUnavailable> => {
	const by_runtime = new Map(report.unavailable_by_runtime.map((entry) => [entry.runtime, entry]));
	return order_cross_runtime_runtimes(report.runtimes)
		.map((runtime) => by_runtime.get(runtime))
		.filter((entry): entry is RuntimeUnavailable => entry != null && entry.rows.length > 0);
};

/**
 * Is the ratio of `runtime` over `base` for one row inside the two measurements'
 * combined noise — a delta the report itself says is not a runtime effect? Reads
 * the composer's pairwise `within_noise`, where each cell names both runtimes.
 * Absence is silence, not a claim the delta is real.
 */
export const is_ratio_within_noise = (
	report: CrossRuntimeReport,
	group: string,
	name: string,
	base: BenchmarkRuntime,
	runtime: BenchmarkRuntime
): boolean =>
	report.within_noise.some(
		(cell) =>
			cell.group === group &&
			cell.name === name &&
			cell.runtimes.includes(base) &&
			cell.runtimes.includes(runtime)
	);

/** Did the composer flag `runtime`'s measurement of one row as unstable? */
export const is_cell_unstable = (
	report: CrossRuntimeReport,
	group: string,
	name: string,
	runtime: BenchmarkRuntime
): boolean =>
	report.unstable_cells.some(
		(cell) => cell.group === group && cell.name === name && cell.runtime === runtime
	);

/**
 * Did `runtime` record `name` as a load failure? The table renders an absent
 * number the same either way, so this is what lets a cell say WHICH gap it is —
 * a binding that couldn't load, or a row that runtime's report never carried.
 */
export const is_impl_unavailable = (
	report: CrossRuntimeReport,
	runtime: BenchmarkRuntime,
	name: string
): boolean =>
	report.unavailable_by_runtime.some(
		(entry) => entry.runtime === runtime && entry.rows.includes(name)
	);

/**
 * The label for a cross-runtime row. Each row spans node/deno/bun columns, and
 * tsv's native build's binding is runtime-specific (N-API on node & bun, C-FFI on
 * deno), so the row can't pin one binding — neutralize `format_label`'s
 * node-centric `(node napi)` suffix to `(native)`. The third-party native rows
 * are npm N-API addons under all three runtimes and get the same neutral suffix;
 * the per-runtime binding is disclosed once in the table caption instead (see
 * `BenchmarksCrossRuntime`).
 */
export const format_cross_runtime_label = (name: string): string =>
	format_label(name).replace(' (node napi)', ' (native)');

/**
 * Cross-runtime ratio cell background: a stable fuz_css red (`palette_c`) / green
 * (`palette_b`) whose ALPHA varies with distance from parity. Fully transparent at ratio
 * `1.0` (parity recedes), ramping to `0.3` alpha at ratio `0.8` and below (red) or `1.2`
 * and above (green). The hue stays constant — only opacity moves — so it reads
 * consistently in light and dark themes while the cell's text keeps the default color.
 * Deliberately its own scale — NOT the shared `baseline_ratio_color` — because cross-runtime
 * deltas cluster tightly near 1.0 and this must not bleed into the other displays.
 */
export const cross_runtime_ratio_background = (ratio: number): string => {
	// 0 alpha at ratio 1.0, up to 0.3 at ratio ≤ 0.8 (red) or ≥ 1.2 (green)
	const alpha = Math.min(1, Math.abs(ratio - 1) / 0.2) * 0.3;
	const color = ratio < 1 ? 'var(--palette_c_50)' : 'var(--palette_b_50)';
	return `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(1)}%, transparent)`;
};
