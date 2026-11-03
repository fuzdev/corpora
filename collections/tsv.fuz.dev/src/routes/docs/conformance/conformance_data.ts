// The parse-conformance domain: the per-source coverage matrices
// `ConformanceTable.svelte` renders, derived from the conformance report (the
// per-runtime report shape, `corpus_kind: 'conformance'`).

import {
	compare_group_order,
	corpus_source_url,
	parse_group_key,
	type BaselineVersions,
	type BenchmarkBaseline,
	type SourceCoverageCell
} from '../benchmarks/benchmark_data.ts';

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
 * native/wasm/internal variants at one release — so the `-wasm` and `-internal`
 * duplicates are dropped and the default `tsv` row stands in for tsv.
 *
 * Which binding stands in is therefore arbitrary — except for oxc, whose wasm
 * binding is pinned to an older release, so only the native row is the current
 * engine; and yuku, where the conformance report carries the wasm row alone: its
 * native binding crashes the host process on this corpus's escaped-identifier
 * tests, so tsv's harness omits that row there. Keying on `yuku-parser` would
 * silently drop the engine.
 */
const CONFORMANCE_ENGINE_NAMES: Record<string, string> = {
	'svelte/compiler': 'svelte/compiler',
	'acorn-typescript': 'acorn-typescript',
	tsv: 'tsv',
	'oxc-parser': 'oxc-parser',
	'yuku-parser-wasm': 'yuku-parser',
	// rsvelte's two parse rows are one engine under two options, so only the
	// default-wire one stands in — the option changes the payload, never the
	// verdict.
	'rsvelte-parse': 'rsvelte',
	swc: 'swc',
	// The TypeScript compiler's own parser, which appears on this surface alone —
	// a verdict rather than a speed, so it carries no throughput row. Its reading
	// changes by corpus source: it selected the compiler cases (`CONFORMANCE_SELECTORS`).
	tsc: 'tsc',
	postcss: 'PostCSS'
};

/**
 * Qualifiers rendered beside an engine's name, keyed by report entry name. The
 * table is per engine and says nothing about bindings — so a note here is for
 * the one case where WHICH binding stands in is worth saying.
 */
const CONFORMANCE_ROW_NOTES: Record<string, string> = {
	// the native binding segfaults on this corpus, spelled out in the page's notes
	'yuku-parser-wasm': 'wasm'
};

/**
 * The report's `versions` keys behind each engine column, keyed by display name.
 * The report carries the harness's whole version map, formatters included, so the
 * page's meta panel lists only these. The shape test holds every column to an
 * entry and every key to the report.
 */
export const CONFORMANCE_ENGINE_VERSIONS: Record<string, Array<keyof BaselineVersions>> = {
	// the meta panel shows tsv's under the run
	tsv: [],
	'svelte/compiler': ['svelte'],
	'acorn-typescript': ['acorn', 'acorn_ts'],
	'oxc-parser': ['oxc_parser'],
	'yuku-parser': ['yuku_parser_wasm'],
	rsvelte: ['rsvelte_parse', 'rsvelte_parse_svelte_target'],
	swc: ['swc'],
	tsc: ['tsc'],
	PostCSS: ['postcss']
};

/** Every `versions` key `CONFORMANCE_ENGINE_VERSIONS` names, for the page's meta panel. */
export const CONFORMANCE_VERSION_KEYS: Array<string> = Object.values(
	CONFORMANCE_ENGINE_VERSIONS
).flat();

/**
 * Derives per-language parse-coverage groups from a conformance report
 * (`corpus_kind: 'conformance'` — parse groups only). Rows are ordered by coverage,
 * highest first; entries without coverage data are dropped.
 */
export const derive_conformance_groups = (baseline: BenchmarkBaseline): Array<ConformanceGroup> => {
	const keyed = baseline.entries.flatMap((entry) => {
		const { operation, language } = parse_group_key(entry.group);
		const name = CONFORMANCE_ENGINE_NAMES[entry.name];
		const { files_processed, files_total } = entry;
		if (operation !== 'parse' || !language || !name) return [];
		if (files_processed == null || files_total == null) return [];
		const row: ConformanceRow = {
			name,
			note: CONFORMANCE_ROW_NOTES[entry.name],
			files_processed,
			files_total,
			coverage_fraction: files_total > 0 ? files_processed / files_total : 0
		};
		return [{ language, row }];
	});

	const result: Array<ConformanceGroup> = [];
	for (const [language, keyed_rows] of Map.groupBy(keyed, (k) => k.language)) {
		const rows = keyed_rows.map((k) => k.row);
		// coverage descending (highest acceptance first), name as a stable tiebreak
		rows.sort((a, b) => b.coverage_fraction - a.coverage_fraction || a.name.localeCompare(b.name));
		result.push({
			language,
			files_total: Math.max(0, ...rows.map((r) => r.files_total)),
			rows
		});
	}
	// every group here is a parse group, so this orders them by language
	result.sort((a, b) =>
		compare_group_order({ operation: 'parse', ...a }, { operation: 'parse', ...b })
	);
	return result;
};

// The two harvested TypeScript caches, as the report's `coverage_by_source` keys them.
const SOURCE_TEST262 = 'benches/js/.cache/test262_files.json';
const SOURCE_TS_REPO = 'benches/js/.cache/ts_repo_files.json';

/**
 * Reader-facing names for the report's corpus source paths. A path missing here
 * renders raw in the matrix, and the shape test fails on it, so a source tsv adds can't reach
 * the page as a cache path unnoticed.
 */
export const CONFORMANCE_SOURCE_LABELS: Record<string, string> = {
	'../prettier-plugin-svelte/test': "prettier-plugin-svelte's tests",
	'../prettier/tests/format/typescript': "Prettier's TypeScript fixtures",
	'../prettier/tests/format/js': "Prettier's JS fixtures",
	'../prettier/tests/format/css': "Prettier's CSS fixtures",
	'../prettier/tests/format/html': "Prettier's HTML fixtures",
	'../svelte/packages/svelte/tests': "Svelte's tests",
	'benches/js/.cache/wpt_css': 'web-platform-tests CSS',
	[SOURCE_TEST262]: 'test262',
	[SOURCE_TS_REPO]: "TypeScript compiler's cases"
};

/**
 * The engine that SELECTED a corpus source, so reads 100% on it by construction
 * rather than by achievement: group key → source path (`*` for every source of
 * the group) → engine display name. Hand-stated because the report carries no
 * such field — svelte/compiler's rejects are excluded from the whole Svelte set,
 * and tsc kept only the compiler cases it parses cleanly. test262 has no entry:
 * its own metadata picks the expected-valid tests, never tsv's verdict, so tsv's
 * 100% there is a result. The shape test holds every entry to the report: it
 * must resolve, and its cell must be full.
 */
export const CONFORMANCE_SELECTORS: Record<string, Record<string, string>> = {
	'parse/svelte': { '*': 'svelte/compiler' },
	'parse/typescript': { [SOURCE_TS_REPO]: 'tsc' }
};

/** One engine's coverage of one corpus source, or of the whole group. */
export interface ConformanceCell {
	processed: number;
	total: number;
	// total - processed, the magnitude a near-100% percentage compresses
	rejected: number;
	coverage_fraction: number;
	// this engine selected the source, so the cell is 100% by construction
	selected: boolean;
}

/** A matrix column — one engine, named as `derive_conformance_groups` names it. */
export interface ConformanceEngine {
	name: string;
	note?: string;
}

/** A corpus source a matrix row covers, for its linked label. */
export interface ConformanceSourceOrigin {
	path: string;
	// `undefined` for a path `CONFORMANCE_SOURCE_LABELS` lacks, which renders raw
	label: string | undefined;
	url: string | undefined;
}

export interface ConformanceSourceRow {
	origin: ConformanceSourceOrigin;
	files: number;
	// aligned to the matrix's `engines`; `undefined` where the report lacks the cell
	cells: Array<ConformanceCell | undefined>;
}

/**
 * The matrix's leading summary row: every engine over the same files, the sources
 * no engine selected. A selector's 100% on its own source is construction, so
 * counting it would rank that engine on files the others had no say in.
 */
export interface ConformanceAggregate {
	// the sources left out because an engine selected them, in row order
	excluded: Array<ConformanceSourceOrigin>;
	files: number;
	// aligned to the matrix's `engines`
	cells: Array<ConformanceCell | undefined>;
}

export interface ConformanceMatrix {
	language: string;
	files_total: number;
	// by coverage of the aggregate's files, highest first, falling back to the
	// group's order (`derive_conformance_groups`) when there is no aggregate
	engines: Array<ConformanceEngine>;
	// largest source first; empty when the report lacks `coverage_by_source`
	sources: Array<ConformanceSourceRow>;
	// `undefined` when an engine selected every source (Svelte), leaving nothing to compare
	aggregate: ConformanceAggregate | undefined;
}

const to_conformance_cell = (
	processed: number,
	total: number,
	selected: boolean
): ConformanceCell => ({
	processed,
	total,
	rejected: total - processed,
	coverage_fraction: total > 0 ? processed / total : 0,
	selected
});

// sums one engine's cells over `rows`, or `undefined` when a row lacks that engine
const sum_cells = (
	rows: Array<ConformanceSourceRow>,
	index: number
): ConformanceCell | undefined => {
	const cells = rows.map((row) => row.cells[index]);
	if (!cells.every((cell) => cell !== undefined)) return undefined;
	return to_conformance_cell(
		cells.reduce((sum, cell) => sum + cell.processed, 0),
		cells.reduce((sum, cell) => sum + cell.total, 0),
		false
	);
};

/**
 * Derives one coverage matrix per language from a conformance report: a row per
 * corpus source and a column per engine, led by the aggregate over the sources no
 * engine selected (`ConformanceAggregate`). A cell whose engine selected its source
 * (`CONFORMANCE_SELECTORS`) is flagged rather than left to read as a result. A
 * report without per-source coverage falls back to the group totals, flagging an
 * engine that selected the whole group.
 */
export const derive_conformance_matrices = (
	baseline: BenchmarkBaseline
): Array<ConformanceMatrix> =>
	derive_conformance_groups(baseline).map((group) => {
		const group_key = `parse/${group.language}`;
		const selectors = CONFORMANCE_SELECTORS[group_key];
		const group_engines = group.rows.map(({ name, note }): ConformanceEngine => ({ name, note }));

		const rows = Object.entries(baseline.coverage_by_source?.[group_key] ?? {}).map(
			([path, by_impl]): ConformanceSourceRow => {
				const by_engine: Record<string, SourceCoverageCell> = {};
				for (const [impl, cell] of Object.entries(by_impl)) {
					const name = CONFORMANCE_ENGINE_NAMES[impl];
					if (name) by_engine[name] ??= cell;
				}
				const selector = selectors?.[path] ?? selectors?.['*'];
				// every impl shares the slice total, which the shape test holds
				const files = Math.max(0, ...Object.values(by_impl).map((cell) => cell.total));
				const source = baseline.corpus_sources.find((s) => s.path === path);
				return {
					origin: {
						path,
						label: CONFORMANCE_SOURCE_LABELS[path],
						url: source && corpus_source_url(source)
					},
					files,
					cells: group_engines.map((engine) => {
						const cell = by_engine[engine.name];
						return (
							cell && to_conformance_cell(cell.processed, cell.total, engine.name === selector)
						);
					})
				};
			}
		);
		// largest first, path as a stable tiebreak
		rows.sort((a, b) => b.files - a.files || a.origin.path.localeCompare(b.origin.path));

		let aggregate: ConformanceAggregate | undefined;
		if (rows.length === 0) {
			aggregate = {
				excluded: [],
				files: group.files_total,
				cells: group.rows.map((row) =>
					to_conformance_cell(row.files_processed, row.files_total, row.name === selectors?.['*'])
				)
			};
		} else {
			const is_selected = (row: ConformanceSourceRow) => row.cells.some((cell) => cell?.selected);
			const base = rows.filter((row) => !is_selected(row));
			if (base.length > 0) {
				aggregate = {
					excluded: rows.filter(is_selected).map((row) => row.origin),
					files: base.reduce((sum, row) => sum + row.files, 0),
					cells: group_engines.map((_, i) => sum_cells(base, i))
				};
			}
		}

		// reorder the columns by the aggregate; a stable sort keeps the group's order on ties
		const order = group_engines.map((_, i) => i);
		if (aggregate) {
			const coverage = (i: number) => aggregate.cells[i]?.coverage_fraction ?? -1;
			order.sort((a, b) => coverage(b) - coverage(a));
		}
		const reorder = <T>(items: Array<T>): Array<T> => order.map((i) => items[i] as T);

		return {
			language: group.language,
			files_total: group.files_total,
			engines: reorder(group_engines),
			sources: rows.map((row) => ({ ...row, cells: reorder(row.cells) })),
			aggregate: aggregate && { ...aggregate, cells: reorder(aggregate.cells) }
		};
	});
