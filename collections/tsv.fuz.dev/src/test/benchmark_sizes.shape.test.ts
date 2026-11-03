import { assert, describe, test } from 'vitest';

import { benchmarks_json } from '#routes/docs/benchmarks/benchmarks.ts';
import {
	categorize_size_capability,
	derive_size_targets,
	to_size_target,
	OXC_FULL_LABEL,
	OXFMT_WASM_LABEL,
	RSVELTE_LABEL,
	SIZE_CAPABILITY_BY_LABEL,
	TSV_NAPI_LABEL
} from '#routes/docs/benchmarks/benchmark_sizes.ts';

// Shape gate for the binary-size half of the committed benchmarks.json: the size
// table's COMPOSITION varies with what the producing machine built, so these pin the
// builds the page's groups and prose depend on.
describe('benchmarks.json binary sizes', () => {
	test('binary sizes include the flagship tsv builds', () => {
		const labels = benchmarks_json.binary_sizes.map((s) => s.label);
		assert.include(labels, 'tsv (napi)'); // flagship N-API build (perf report anchor)
		assert.include(labels, 'tsv-wasm'); // the full wasm build — the tldr's wasm size claim reads it
	});

	test('every build is a kind the target split knows', () => {
		// `to_size_target` files anything not native under the browser, and the report
		// is cast rather than validated, so a new kind would land there unchecked
		for (const size of benchmarks_json.binary_sizes) {
			assert.include(['native', 'wasm', 'js'], size.kind, size.label);
		}
	});

	test('every hand-stated capability label still names a build in the report', () => {
		// `categorize_size_capability` falls back to `full` for a label whose name says
		// nothing about what it does, which is right only for builds that really ship
		// both operations. The labels in the table are the exceptions, matched by
		// exact string — a rename upstream misses the lookup and lands silently in
		// `full`, where `swc (napi)` (a whole compiler) would become the flagship group's
		// `max` and rescale every bar in it.
		const labels = new Set(benchmarks_json.binary_sizes.map((s) => s.label));
		for (const label of Object.keys(SIZE_CAPABILITY_BY_LABEL)) {
			assert.ok(
				labels.has(label),
				`"${label}" is hand-mapped to a capability but no longer names a build — ` +
					`it now falls through to "full"`
			);
		}
	});

	test('binary sizes split by target, then group by capability with one default anchor', () => {
		const targets = derive_size_targets(benchmarks_json.binary_sizes);
		for (const [target, groups] of Object.entries(targets)) {
			// full / formatter / parser, in that order, all present in the current data
			assert.deepStrictEqual(
				groups.map((g) => g.capability),
				['full', 'formatter', 'parser'],
				target
			);
			for (const group of groups) {
				assert.isNotEmpty(group.entries);
				for (const e of group.entries) {
					// every entry lands in the target and group its kind and capability name
					assert.strictEqual(to_size_target(e), target, `${e.label} target`);
					// tsv's full native addon also stands in the other native groups
					if (e.label === TSV_NAPI_LABEL) continue;
					assert.strictEqual(categorize_size_capability(e.label), group.capability);
				}
				// the smallest real build leads the group — a disabled placeholder must not
				// sort first — and is the default ratio anchor (the 1.0x row) unless the
				// group holds tsv's published native build, which then anchors instead
				const real = group.entries.filter((e) => !e.disabled);
				const smallest = real.reduce((a, b) => (a.bytes <= b.bytes ? a : b));
				assert.strictEqual(
					group.entries[0]?.label,
					smallest.label,
					`${target} ${group.capability}`
				);
				assert.strictEqual(
					group.anchor_label,
					real.some((e) => e.label === TSV_NAPI_LABEL) ? TSV_NAPI_LABEL : smallest.label,
					`${target} ${group.capability} anchor`
				);
			}
		}
		// the parser groups pit tsv against oxc-parser on both targets
		const labels = (groups: typeof targets.browser, capability: string) =>
			groups.find((g) => g.capability === capability)?.entries.map((e) => e.label) ?? [];
		assert.include(labels(targets.browser, 'parser'), 'oxc-parser (wasm)');
		assert.include(labels(targets.native, 'parser'), 'oxc-parser (napi)');
	});

	test('the native full toolchain carries the combined oxc-parser + oxfmt entry', () => {
		const sizes = benchmarks_json.binary_sizes;
		const full = derive_size_targets(sizes).native.find((g) => g.capability === 'full');
		const combined = full?.entries.find((e) => e.label === OXC_FULL_LABEL);
		assert.ok(combined, 'combined oxc entry missing from the native full toolchain');

		// its bytes and gzip are the sum of oxc's separate parser and formatter builds
		const oxc_parser = sizes.find((s) => s.label === 'oxc-parser (napi)');
		const oxfmt = sizes.find((s) => s.label === 'oxfmt (napi)');
		assert.ok(oxc_parser && oxfmt, 'source oxc builds missing');
		assert.strictEqual(combined.bytes, oxc_parser.bytes + oxfmt.bytes);
		assert.strictEqual(combined.gzip_bytes, oxc_parser.gzip_bytes! + oxfmt.gzip_bytes!);
		assert.strictEqual(combined.category, 'oxc');
	});

	test('the native formatter group carries the rsvelte-fmt binary the notes describe', () => {
		const formatter = derive_size_targets(benchmarks_json.binary_sizes).native.find(
			(g) => g.capability === 'formatter'
		);
		const rsvelte = formatter?.entries.find((e) => e.label === RSVELTE_LABEL);
		assert.ok(rsvelte, 'rsvelte-fmt build missing from the native formatter group');
		assert.isNotOk(rsvelte.disabled);
		assert.strictEqual(rsvelte.category, 'rsvelte');
	});

	test('tsv\'s artifacts are "smaller than theirs too, except against oxc-parser\'s native build"', () => {
		// The TLDR's size claim against Oxc and Biome, like for like within each target
		// and capability: tsv's wasm builds against the wasm competitors, its native
		// builds against the native ones
		const targets = derive_size_targets(benchmarks_json.binary_sizes);
		const bytes = (target: 'browser' | 'native', capability: string, label: string): number => {
			const entry = targets[target]
				.find((g) => g.capability === capability)
				?.entries.find((e) => e.label === label);
			assert(entry && !entry.disabled, `${target} ${capability}: ${label} missing`);
			return entry.bytes;
		};
		const PAIRS: Array<['browser' | 'native', string, string, string]> = [
			['browser', 'full', 'tsv-wasm', 'biome (wasm)'],
			['browser', 'parser', 'tsv-parse-wasm', 'oxc-parser (wasm)'],
			['native', 'full', 'tsv (napi)', OXC_FULL_LABEL],
			['native', 'full', 'tsv (ffi)', OXC_FULL_LABEL],
			['native', 'formatter', 'tsv (napi)', 'oxfmt (napi)'],
			['native', 'formatter', 'tsv format (ffi)', 'oxfmt (napi)'],
			['native', 'parser', 'tsv parse (ffi)', 'oxc-parser (napi)']
		];
		for (const [target, capability, tsv, other] of PAIRS) {
			assert.isBelow(
				bytes(target, capability, tsv),
				bytes(target, capability, other),
				`${target} ${capability}: ${tsv} vs ${other}`
			);
		}
		// the exception: tsv publishes no native parse-only build, so its full addon
		// is the installable row beside oxc-parser's
		assert.isAbove(
			bytes('native', 'parser', 'tsv (napi)'),
			bytes('native', 'parser', 'oxc-parser (napi)')
		);
	});

	test('the size notes on the js bundles hold: full barely over formatter, and gz flatters them', () => {
		const sizes = benchmarks_json.binary_sizes;
		const bundles = sizes.filter((s) => s.kind === 'js');
		const named = (capability: string) =>
			bundles.find((s) => SIZE_CAPABILITY_BY_LABEL[s.label] === capability);
		const full = named('full');
		const formatter = named('formatter');
		assert(full && formatter, 'the full and formatter bundles are missing');
		// "barely larger": the formatter already contains the Svelte parser
		assert.isAbove(full.bytes, formatter.bytes);
		assert.isBelow(full.bytes, formatter.bytes * 1.01);
		// "minified JS compresses much better than tsv's wasm" — tsv's only: other wasm
		// builds (biome's, dprint's) gzip about as well as the bundles
		const gz_share = (s: (typeof sizes)[number]) => (s.gzip_bytes ?? NaN) / s.bytes;
		const tsv_wasm = sizes.filter(
			(s) => s.kind === 'wasm' && s.label.startsWith('tsv') && s.gzip_bytes != null
		);
		assert.isNotEmpty(tsv_wasm);
		const best_tsv_wasm = Math.min(...tsv_wasm.map(gz_share));
		for (const bundle of bundles) {
			assert.isBelow(gz_share(bundle), best_tsv_wasm * 0.8, bundle.label);
		}
	});

	test('the dprint and Malva note reads the sizes: Malva smaller on scope, dprint larger regardless', () => {
		const size = (label: string) => {
			const found = benchmarks_json.binary_sizes.find((s) => s.label === label);
			assert(found, `${label} is missing`);
			return found.bytes;
		};
		const tsv_format = size('tsv-format-wasm');
		assert.isBelow(size('malva (wasm)'), tsv_format);
		assert.isAbove(size('dprint (wasm)'), tsv_format);
	});

	test('the browser formatter group ends with a disabled oxfmt (wasm) placeholder, since oxfmt has no wasm build', () => {
		const { browser, native } = derive_size_targets(benchmarks_json.binary_sizes);
		const formatter = browser.find((g) => g.capability === 'formatter');
		assert.ok(formatter, 'browser formatter group missing');
		const placeholder = formatter.entries.at(-1);
		assert.ok(placeholder, 'browser formatter group is empty');
		assert.strictEqual(placeholder.label, OXFMT_WASM_LABEL);
		assert.ok(placeholder.disabled, 'oxfmt (wasm) should be disabled');
		assert.strictEqual(placeholder.kind, 'wasm');
		assert.strictEqual(placeholder.category, 'oxc');
		assert.strictEqual(placeholder.bar_fraction, 0);
		assert.isFalse(native.some((g) => g.entries.some((e) => e.label === OXFMT_WASM_LABEL)));
	});
});
