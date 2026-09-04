import { describe, test, assert } from 'vitest';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { validate_syntax_events } from '$lib/lexer.ts';
import { PATHOLOGICAL_CASES } from './pathological.ts';

// Pathological workloads (see `pathological.ts`) — enforces the lexer design's
// linearity rule: no rescans, work O(n) per language layer. Realistic samples
// can't catch a quadratic boundary scan; these inputs are built to.

const SMALL_SIZE = 16384;
const SCALE = 16;
// linear scaling gives a time ratio near SCALE; quadratic gives near SCALE² —
// the bound sits well above linear-with-noise and well below quadratic. The
// sizes matter as much as the bound: a quadratic backed by native `indexOf`
// (memchr-class speed) hides inside its constant factor at small sizes — at
// 4KB→32KB such a case measured ~26x, under the old 40x bound; at these sizes
// it measures well over 100x.
const MAX_RATIO = SCALE * 4;

/**
 * Times one lex of `text`, taking the best of several batches with enough
 * repetitions that timer resolution and scheduler noise don't dominate.
 */
const time_lex = (text: string, lang: string): number => {
	syntax_styler_global.lex(text, lang); // warm
	const t0 = performance.now();
	syntax_styler_global.lex(text, lang);
	const once = performance.now() - t0;
	// target ≥5ms per batch, capped so fast cases don't spin needlessly
	const reps = Math.min(100, Math.max(1, Math.ceil(5 / Math.max(once, 0.05))));
	let best = Infinity;
	for (let batch = 0; batch < 3; batch++) {
		const start = performance.now();
		for (let r = 0; r < reps; r++) {
			syntax_styler_global.lex(text, lang);
		}
		const per_rep = (performance.now() - start) / reps;
		if (per_rep < best) best = per_rep;
	}
	return best;
};

for (const { name, lang, generate } of PATHOLOGICAL_CASES) {
	describe(`pathological: ${name}`, () => {
		test('produces a valid event stream at both sizes', () => {
			for (const size of [SMALL_SIZE, SMALL_SIZE * SCALE]) {
				const lexed = syntax_styler_global.lex(generate(size), lang);
				assert.deepEqual(validate_syntax_events(lexed), []);
			}
		});

		test('scales linearly', () => {
			const t_small = time_lex(generate(SMALL_SIZE), lang);
			const t_large = time_lex(generate(SMALL_SIZE * SCALE), lang);
			const ratio = t_large / t_small;
			assert.isBelow(
				ratio,
				MAX_RATIO,
				`${name}: ${SCALE}x input took ${ratio.toFixed(1)}x time ` +
					`(${(t_small * 1000).toFixed(0)}μs → ${(t_large * 1000).toFixed(0)}μs) — superlinear scaling`
			);
		});
	});
}
