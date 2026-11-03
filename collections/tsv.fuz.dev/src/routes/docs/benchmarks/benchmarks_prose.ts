// The in-process pairings the benchmarks page's copy names, as `[group, slower,
// faster]` in the direction each sentence reads. The page renders a ratio for each
// and `benchmark_data.prose.test.ts` gates that every one resolves and still runs
// that way — one table rather than two hand-kept lists, so a pairing added to the
// copy can't go ungated.

/** A claim the copy makes: `faster` leads `slower` in `group`, so the ratio reads above 1. */
export type InProcessPair = readonly [group: string, slower: string, faster: string];

/**
 * Keyed by the name the page gives each ratio, so the copy reads by key and the
 * test iterates the values. Native-vs-native pairs tsv with oxfmt, wasm-vs-wasm
 * pairs tsv-wasm with biome-wasm; the parse comparisons pair each tsv wire with the
 * tools whose AST carries the same kind of positions.
 */
export const IN_PROCESS_PAIRS = {
	format_ts_vs_oxfmt: ['format/typescript', 'oxfmt', 'tsv'],
	format_ts_vs_prettier: ['format/typescript', 'prettier', 'tsv'],
	format_ts_wasm_vs_prettier: ['format/typescript', 'prettier', 'tsv-wasm'],
	format_ts_vs_biome: ['format/typescript', 'biome-wasm', 'tsv-wasm'],
	format_svelte_vs_prettier: ['format/svelte', 'prettier', 'tsv'],
	format_svelte_wasm_vs_prettier: ['format/svelte', 'prettier', 'tsv-wasm'],
	format_svelte_vs_biome: ['format/svelte', 'biome-wasm', 'tsv-wasm'],
	format_css_vs_oxfmt: ['format/css', 'oxfmt', 'tsv'],
	format_css_vs_prettier: ['format/css', 'prettier', 'tsv'],
	format_css_wasm_vs_prettier: ['format/css', 'prettier', 'tsv-wasm'],
	format_css_vs_biome: ['format/css', 'biome-wasm', 'tsv-wasm'],
	// the parse comparisons by payload: tsv's default span-only wire against the
	// span-only ASTs (oxc-parser, yuku-parser, Svelte's `parseCss`) and PostCSS, and
	// `+locations` against the parsers that carry a `loc` (acorn-typescript, Svelte's)
	parse_ts_vs_oxc: ['parse/typescript', 'oxc-parser', 'tsv'],
	// the drop-in comparison: `{locations: true}` returns acorn's shape, `loc` included
	parse_ts_vs_acorn: ['parse/typescript', 'acorn-typescript', 'tsv+locations'],
	// "at ~Nx the default's time" — what `{locations: true}` costs over the span-only wire
	parse_ts_loc_cost: ['parse/typescript', 'tsv+locations', 'tsv'],
	// the entries that lead tsv's default wire, quoted in the direction the data runs:
	// yuku-parser, and oxc-parser over its raw transfer (no JSON hand-off)
	parse_ts_yuku_vs_tsv: ['parse/typescript', 'tsv', 'yuku-parser'],
	parse_ts_oxc_raw_vs_tsv: ['parse/typescript', 'tsv', 'oxc-parser-raw'],
	// the wasm-vs-wasm pairing runs wider than the native one, so the copy quotes both
	parse_ts_yuku_wasm_vs_tsv_wasm: ['parse/typescript', 'tsv-wasm', 'yuku-parser-wasm'],
	parse_svelte_vs_compiler: ['parse/svelte', 'svelte/compiler', 'tsv+locations'],
	parse_svelte_default_vs_compiler: ['parse/svelte', 'svelte/compiler', 'tsv'],
	parse_svelte_vs_rsvelte: ['parse/svelte', 'rsvelte-parse', 'tsv+locations'],
	parse_css_compiler_vs_tsv: ['parse/css', 'tsv', 'svelte/compiler'],
	parse_css_postcss_vs_tsv: ['parse/css', 'tsv', 'postcss'],
	// Gated but not rendered: "still ahead of oxc-parser's JSON path and swc" with `loc`
	// is a composite of `parse_ts_vs_oxc` and `parse_ts_loc_cost`, true only while tsv's
	// span-only lead outruns the loc cost, so the sentence is gated as its own pairs.
	parse_ts_locations_vs_oxc: ['parse/typescript', 'oxc-parser', 'tsv+locations'],
	parse_ts_locations_vs_swc: ['parse/typescript', 'swc', 'tsv+locations']
} as const satisfies Record<string, InProcessPair>;

export type InProcessPairKey = keyof typeof IN_PROCESS_PAIRS;

/** The pairs the copy gates without printing a ratio, so no instability note can attach. */
export const UNRENDERED_PAIRS: ReadonlySet<InProcessPairKey> = new Set([
	'parse_ts_locations_vs_oxc',
	'parse_ts_locations_vs_swc'
]);

/**
 * The rendered pairs whose copy carries an instability note slot (`(N% instability)`,
 * empty while both rows are stable). The prose test fails when a rendered pair reads
 * unstable without one, so a refresh that destabilizes a row prompts a slot here and
 * in the copy.
 */
export const INSTABILITY_NOTED: ReadonlySet<InProcessPairKey> = new Set([
	'parse_ts_oxc_raw_vs_tsv'
]);
