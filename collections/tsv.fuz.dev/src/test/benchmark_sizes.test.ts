import { assert, describe, test } from 'vitest';

import {
	categorize_size,
	categorize_size_capability,
	derive_size_targets,
	OXC_FULL_LABEL,
	OXFMT_WASM_LABEL,
	type SizeCapability
} from '#routes/docs/benchmarks/benchmark_sizes.ts';
import type { BinarySize } from '#routes/docs/benchmarks/benchmark_data.ts';

// Binary-size capability grouping. The heuristic reads the tool's NAME, so the
// tools not named after their job are the ones that can silently land under a
// heading that misdescribes them (a formatter filed as "parse + format").
describe('categorize_size_capability', () => {
	test('reads the job out of a label that names it', () => {
		assert.strictEqual(categorize_size_capability('tsv parse (ffi)'), 'parser');
		assert.strictEqual(categorize_size_capability('tsv-format-wasm'), 'formatter');
		assert.strictEqual(categorize_size_capability('oxfmt (napi)'), 'formatter');
		assert.strictEqual(categorize_size_capability(OXC_FULL_LABEL), 'full');
		assert.strictEqual(categorize_size_capability('tsv (napi)'), 'full');
	});

	test('the tools whose names say nothing are stated, not guessed', () => {
		// each of these would otherwise fall through to `full` — a "parse + format"
		// heading over four builds, two shipping only a formatter and two no formatter
		assert.strictEqual(categorize_size_capability('dprint (wasm)'), 'formatter');
		assert.strictEqual(categorize_size_capability('malva (wasm)'), 'formatter');
		assert.strictEqual(categorize_size_capability('swc (napi)'), 'parser');
		assert.strictEqual(categorize_size_capability('rsvelte compiler (napi)'), 'parser');
	});

	test('the canonical js bundles land one per capability, colored as canonical', () => {
		// by keyword `prettier + parsers` reads as a parser and the prettier bundle as full
		const labels: Array<[string, SizeCapability]> = [
			['svelte + acorn-typescript parsers (js bundle)', 'parser'],
			['prettier + svelte plugin (js bundle)', 'formatter'],
			['prettier + parsers (js bundle)', 'full']
		];
		for (const [label, capability] of labels) {
			assert.strictEqual(categorize_size_capability(label), capability);
			assert.strictEqual(categorize_size(label), 'canonical');
		}
	});

	test('the two dprint plugins share a bucket', () => {
		// only `malva` reads as a formatter by name — see `SIZE_CAPABILITY_BY_LABEL`
		assert.strictEqual(
			categorize_size_capability('dprint (wasm)'),
			categorize_size_capability('malva (wasm)')
		);
	});
});

describe('derive_size_targets', () => {
	const size = (label: string, bytes: number): BinarySize => ({
		label,
		bytes,
		kind: label.includes('wasm') ? 'wasm' : label.includes('js bundle') ? 'js' : 'native',
		gzip_bytes: null
	});

	test('wasm and js builds land in the browser target, native builds in the native one', () => {
		const targets = derive_size_targets([
			size('tsv-wasm', 3),
			size('prettier + parsers (js bundle)', 2),
			size('tsv (napi)', 4)
		]);
		const labels = (groups: typeof targets.browser) =>
			groups.flatMap((g) => g.entries.filter((e) => !e.disabled).map((e) => e.label));
		assert.sameMembers(labels(targets.browser), ['tsv-wasm', 'prettier + parsers (js bundle)']);
		assert.sameMembers(labels(targets.native), ['tsv (napi)']);
	});

	test('the browser formatter group ends with the oxfmt wasm placeholder', () => {
		const { browser, native } = derive_size_targets([
			size('tsv-format-wasm', 10),
			size('dprint (wasm)', 20),
			size('oxfmt (napi)', 30)
		]);
		const formatter = browser.find((g) => g.capability === 'formatter');
		assert.deepEqual(
			formatter?.entries.map((e) => e.label),
			['tsv-format-wasm', 'dprint (wasm)', OXFMT_WASM_LABEL]
		);
		assert.isTrue(formatter?.entries.at(-1)?.disabled);
		assert.isFalse(native.some((g) => g.entries.some((e) => e.label === OXFMT_WASM_LABEL)));
	});

	test("a group anchors on tsv's published native build where it has one, else its smallest", () => {
		const { native, browser } = derive_size_targets([
			size('tsv (ffi)', 3),
			size('tsv (napi)', 4),
			size('tsv parse (ffi)', 2),
			size('tsv format (ffi)', 2),
			size('oxfmt (napi)', 8),
			size('oxc-parser (napi)', 5),
			size('tsv-wasm', 6),
			size('biome (wasm)', 9)
		]);
		const anchor = (groups: typeof native, capability: string) =>
			groups.find((g) => g.capability === capability)?.anchor_label;
		assert.strictEqual(anchor(native, 'full'), 'tsv (napi)'); // not the smaller, unpublished ffi
		// the full addon stands in the other native groups too: tsv publishes no
		// format-only or parse-only one
		assert.strictEqual(anchor(native, 'formatter'), 'tsv (napi)');
		assert.strictEqual(anchor(native, 'parser'), 'tsv (napi)');
		assert.strictEqual(anchor(browser, 'full'), 'tsv-wasm');
	});

	test('the oxc sum lands in the native full toolchain and carries gzip only when both halves do', () => {
		const full = (sizes: Array<BinarySize>) =>
			derive_size_targets(sizes).native
				.find((g) => g.capability === 'full')
				?.entries.find((e) => e.label === OXC_FULL_LABEL);
		const both = full([
			{ ...size('oxc-parser (napi)', 5), gzip_bytes: 2 },
			{ ...size('oxfmt (napi)', 7), gzip_bytes: 3 }
		]);
		assert.strictEqual(both?.bytes, 12);
		assert.strictEqual(both?.gzip_bytes, 5);
		const one = full([{ ...size('oxc-parser (napi)', 5), gzip_bytes: 2 }, size('oxfmt (napi)', 7)]);
		assert.strictEqual(one?.bytes, 12);
		assert.isNull(one?.gzip_bytes);
	});

	test('the oxc sum needs both halves', () => {
		const { native } = derive_size_targets([size('oxc-parser (napi)', 5)]);
		assert.isFalse(native.some((g) => g.entries.some((e) => e.label === OXC_FULL_LABEL)));
	});
});
