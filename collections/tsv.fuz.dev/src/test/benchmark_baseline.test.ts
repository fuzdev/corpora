import { assert, describe, test } from 'vitest';

import {
	baseline_ratio_color,
	compute_baseline_ratio,
	to_baseline_key
} from '#routes/docs/benchmarks/benchmark_baseline.ts';

describe('compute_baseline_ratio', () => {
	test('reads the anchor as the reference — a lower measurement exceeds 1', () => {
		// anchor 100; an entry at 50 (ns or bytes) is 2x better, one at 200 is half as good
		assert.strictEqual(compute_baseline_ratio(50, 100), 2);
		assert.strictEqual(compute_baseline_ratio(200, 100), 0.5);
		assert.strictEqual(compute_baseline_ratio(100, 100), 1);
	});
});

describe('baseline_ratio_color', () => {
	test('worse than the anchor runs red to orange, better runs yellow to teal', () => {
		assert.strictEqual(baseline_ratio_color(0.4), 'var(--palette_c_50)');
		assert.strictEqual(baseline_ratio_color(0.9), 'var(--palette_h_50)');
		assert.strictEqual(baseline_ratio_color(10), 'var(--palette_j_50)');
	});

	test('each band starts at its threshold', () => {
		for (const edge of [0.5, 1, 2, 5]) {
			assert.notStrictEqual(baseline_ratio_color(edge - 0.01), baseline_ratio_color(edge));
		}
	});
});

describe('to_baseline_key', () => {
	// the tests run without a DOM, so the event target is the two members the read touches
	const event = (row: { dataset: Record<string, string> } | null): Event =>
		({ target: { closest: () => row } }) as unknown as Event;

	test('reads the key off the row under the pointer', () => {
		assert.strictEqual(
			to_baseline_key(event({ dataset: { baselineKey: 'prettier' } })),
			'prettier'
		);
	});

	test('no row under the pointer, or no target at all, is no key', () => {
		assert.isUndefined(to_baseline_key(event(null)));
		assert.isUndefined(to_baseline_key({ target: null } as unknown as Event));
	});
});
