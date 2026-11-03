// The binary-size domain of the benchmarks page: category, the browser/native
// target split, capability grouping, and the synthesized combined oxc build. The
// report shapes these read live in `benchmark_data.ts`; the ratio color scale is
// `benchmark_baseline.ts`'s shared `baseline_ratio_color`.

import type { BinarySize, ImplementationCategory } from './benchmark_data.ts';

// Binary-size categorization

/** The suffix every synthesized canonical bundle's label carries (tsv's `canonical_bundles.ts`). */
const JS_BUNDLE_SUFFIX = '(js bundle)';

/**
 * The color category for a binary-size label — the size table's analog of
 * `categorize_row`, read off the label prefix since size labels carry a
 * parenthesized build kind rather than a report row name.
 */
export const categorize_size = (label: string): ImplementationCategory => {
	// the canonical toolchain's synthesized bundles — see `CANONICAL_BUNDLE_LABELS`
	if (label.endsWith(JS_BUNDLE_SUFFIX)) return 'canonical';
	// covers `tsv-wasm` plus the `tsv-format-wasm`/`tsv-parse-wasm` subsets
	if (label.startsWith('tsv') && label.includes('wasm')) return 'tsv_wasm';
	if (label.startsWith('tsv')) return 'tsv_native';
	if (label.startsWith('biome')) return 'biome';
	if (label.startsWith('dprint')) return 'dprint';
	if (label.startsWith('malva')) return 'dprint'; // dprint's CSS plugin — see `categorize_row`
	if (label.startsWith('markup_fmt')) return 'dprint'; // dprint's Svelte plugin, likewise
	// Covers both `rsvelte-fmt (binary)` and `rsvelte compiler (napi)`.
	if (label.startsWith('rsvelte')) return 'rsvelte';
	if (label.startsWith('swc')) return 'swc';
	if (label.startsWith('yuku')) return 'yuku';
	return 'oxc'; // oxc-parser / oxfmt, and any unrecognized label
};

// Binary-size grouping by capability

/** What a build actually does, used to group binary sizes for like-for-like comparison. */
export type SizeCapability = 'full' | 'formatter' | 'parser';

/**
 * Capability for the labels whose NAME doesn't say what the build does, so the
 * keyword heuristic below can't reach them.
 *
 * The heuristic reads `parse`/`format`/`fmt` out of the label, which works only
 * while a tool is named after its job. These aren't, and the fallback for an
 * unreadable label is `full` — a heading that reads "parse + format" over builds
 * that ship no formatter at all, or none but a formatter. So each one is stated
 * instead:
 *
 * - `dprint` and `malva` are the SAME kind of artifact and must land in the same
 *   bucket: both are dprint plugins loaded over the one `@dprint/formatter` host,
 *   and neither exposes a parser. dprint's covers TypeScript/JS and JSX, malva's
 *   CSS and its dialects — each one of tsv's three languages plus syntax tsv
 *   doesn't format, so pair both against `tsv-format-wasm`: malva's smaller size
 *   there is scope, while dprint is larger despite it.
 * - `swc` and rsvelte's addon back parse rows and ship no formatter. Both are far
 *   wider than what the rows measure — swc's `.node` is an entire compiler
 *   (transforms, minifier, bundler) and rsvelte's carries the compiler plus
 *   svelte2tsx, HMR diffing and a resolver — so `parser` is the least-wrong
 *   heading rather than a claim of scope match. The notes beside the table say so.
 *
 * - The three `(js bundle)` labels are the canonical toolchain — prettier and the
 *   canonical parsers — as minified bundles the tsv harness builds, one per
 *   capability by construction, so each is stated rather than read: the keyword
 *   heuristic would file `prettier + parsers` under `parser` and the plain
 *   prettier bundle under `full`.
 *
 * `biome` is deliberately not here: the bucket sizes what an artifact ships, and
 * Biome's wasm build really is the whole toolchain.
 */
export const SIZE_CAPABILITY_BY_LABEL: Record<string, SizeCapability> = {
	'svelte + acorn-typescript parsers (js bundle)': 'parser',
	'prettier + svelte plugin (js bundle)': 'formatter',
	'prettier + parsers (js bundle)': 'full',
	'dprint (wasm)': 'formatter',
	'malva (wasm)': 'formatter',
	'swc (napi)': 'parser',
	'rsvelte compiler (napi)': 'parser'
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
	const has_parse = label.includes('parse');
	const has_format = label.includes('format') || label.includes('fmt');
	// a build that does both is a full toolchain (e.g. the combined oxc-parser + oxfmt entry)
	if (has_parse && has_format) return 'full';
	if (has_parse) return 'parser'; // tsv parse (ffi), tsv-parse-wasm, oxc-parser
	if (has_format) return 'formatter'; // tsv format, oxfmt
	// Reaching here must be a DECISION, not a name the heuristic couldn't read:
	// every label that lands in `full` this way ships both operations (biome's whole
	// toolchain included). Anything else belongs in the table above.
	return 'full'; // tsv (napi/ffi), tsv-wasm, biome (wasm)
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
	// sorted smallest-first
	entries: Array<SizeDisplayEntry>;
	/**
	 * The entry the group's ratios default to (its 1.00x row): `TSV_NAPI_LABEL` where
	 * the group has it, since the smaller `(ffi)` builds beside it aren't published
	 * and a ratio against them compares with nothing a reader can install; otherwise
	 * the smallest build.
	 */
	anchor_label: string | undefined;
}

/**
 * Where a build runs, the size section's first split: a browser loads only wasm
 * and JS, so those builds stand apart from the native addons and binaries. A
 * browser group still mixes wasm and JS, which compress differently.
 */
export type SizeTarget = 'browser' | 'native';

export const to_size_target = (size: Pick<BinarySize, 'kind'>): SizeTarget =>
	size.kind === 'native' ? 'native' : 'browser';

const SIZE_CAPABILITY_ORDER: ReadonlyArray<{
	capability: SizeCapability;
	heading: string;
}> = [
	{ capability: 'full', heading: 'Full toolchain (parse + format)' },
	{ capability: 'formatter', heading: 'Formatter' },
	{ capability: 'parser', heading: 'Parser' }
];

/** tsv's published native build, the full N-API addon — the label the tsv harness emits. */
export const TSV_NAPI_LABEL = 'tsv (napi)';

/** The measured oxfmt native addon — the label the tsv harness emits, half of the synthesized oxc sum. */
export const OXFMT_NATIVE_LABEL = 'oxfmt (napi)';

/** The measured oxc-parser native addon — the label the tsv harness emits. */
const OXC_PARSER_NATIVE_LABEL = 'oxc-parser (napi)';

/** Display label for the synthesized combined oxc full-toolchain build. */
export const OXC_FULL_LABEL = 'oxc-parser + oxfmt (napi)';

/** Display label for oxfmt's absent wasm build placeholder — see `derive_size_targets`. */
export const OXFMT_WASM_LABEL = 'oxfmt (wasm)';

/** The rsvelte-fmt binary on its own — the label the tsv harness emits. */
export const RSVELTE_LABEL = 'rsvelte-fmt (binary)';

/**
 * Synthesizes oxc's full-toolchain native build by summing its separately-shipped
 * parser (`oxc-parser (napi)`) and formatter (`oxfmt (napi)`) addons — together
 * they're the closest equivalent to tsv's single parse+format build, so the entry
 * stands beside `tsv (napi)` in the native full-toolchain group. Returns
 * `undefined` when either half is missing, and sums gzip only when both carry it.
 */
const synthesize_oxc_full = (sizes: Array<BinarySize>): BinarySize | undefined => {
	const parser = sizes.find((s) => s.label === OXC_PARSER_NATIVE_LABEL);
	const formatter = sizes.find((s) => s.label === OXFMT_NATIVE_LABEL);
	if (!parser || !formatter) return undefined;
	return {
		label: OXC_FULL_LABEL,
		bytes: parser.bytes + formatter.bytes,
		kind: 'native',
		gzip_bytes:
			parser.gzip_bytes != null && formatter.gzip_bytes != null
				? parser.gzip_bytes + formatter.gzip_bytes
				: null
	};
};

/**
 * Splits the binary sizes by target (see `SizeTarget`), then groups each target's
 * builds by capability (full / formatter / parser), smallest-first. Bars scale to
 * the group's largest entry and the ratio anchors on `anchor_label`, so exactly one
 * entry per group reads 1.00x, whichever tool that is. A combined
 * `oxc-parser + oxfmt` entry is synthesized into the native full-toolchain group,
 * since oxc ships parse and format apart. `TSV_NAPI_LABEL` appears in every native
 * group, anchoring each. oxfmt has no wasm build, so the browser formatter group ends with a disabled `oxfmt (wasm)` placeholder, holding its
 * slot rather than omitting it.
 */
export const derive_size_targets = (
	sizes: Array<BinarySize>
): Record<SizeTarget, Array<SizeCapabilityGroup>> => {
	const oxc_full = synthesize_oxc_full(sizes);
	const all_sizes = oxc_full ? [...sizes, oxc_full] : sizes;
	return {
		browser: to_capability_groups(all_sizes, 'browser'),
		native: to_capability_groups(all_sizes, 'native')
	};
};

const to_capability_groups = (
	sizes: Array<BinarySize>,
	target: SizeTarget
): Array<SizeCapabilityGroup> => {
	const groups: Array<SizeCapabilityGroup> = [];
	for (const { capability, heading } of SIZE_CAPABILITY_ORDER) {
		const items = sizes.filter(
			(s) => to_size_target(s) === target && categorize_size_capability(s.label) === capability
		);
		if (items.length === 0) continue;
		// tsv publishes no native formatter-only or parse-only build, so its full addon
		// stands in both native groups too, as the row a reader can install
		if (target === 'native' && capability !== 'full') {
			const napi = sizes.find((s) => s.label === TSV_NAPI_LABEL);
			if (napi) items.push(napi);
		}
		const max = Math.max(...items.map((s) => s.bytes));
		const entries: Array<SizeDisplayEntry> = items
			.toSorted((a, b) => a.bytes - b.bytes)
			.map((s) => ({
				...s,
				bar_fraction: max > 0 ? s.bytes / max : 0,
				category: categorize_size(s.label)
			}));
		if (
			target === 'browser' &&
			capability === 'formatter' &&
			!entries.some((e) => e.label === OXFMT_WASM_LABEL)
		) {
			entries.push({
				label: OXFMT_WASM_LABEL,
				bytes: 0,
				kind: 'wasm',
				gzip_bytes: null,
				bar_fraction: 0,
				category: categorize_size(OXFMT_WASM_LABEL),
				disabled: true
			});
		}
		const anchor_label = (
			entries.find((e) => e.label === TSV_NAPI_LABEL) ?? entries.find((e) => !e.disabled)
		)?.label;
		groups.push({ capability, heading, entries, anchor_label });
	}
	return groups;
};
