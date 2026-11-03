import { assert, describe, test } from 'vitest';

import { conformance_json } from '#routes/docs/conformance/conformance.ts';
import { derive_corpus_source_table } from '#routes/docs/benchmarks/benchmark_data.ts';
import {
	CONFORMANCE_SELECTORS,
	CONFORMANCE_SOURCE_LABELS,
	derive_conformance_groups,
	derive_conformance_matrices
} from '#routes/docs/conformance/conformance_data.ts';

// Gates the claims the conformance page's prose makes about the committed report,
// as `benchmark_data.prose.test.ts` does for the benchmarks page.
describe('conformance prose reads the report', () => {
	test('the unfiltered CSS sources are the ones some parser falls short of', () => {
		// "the CSS sources keep invalid and out-of-scope inputs ... read a row's parsers
		// against each other, not against 100%" — named for wpt's CSS and Prettier's `.css`
		// fixtures, each of which some parser falls short of
		const css = derive_conformance_matrices(conformance_json).find((m) => m.language === 'css');
		for (const path of ['benches/js/.cache/wpt_css', '../prettier/tests/format/css']) {
			const row = css?.sources.find((s) => s.origin.path === path);
			assert(row, `css ${path} is missing`);
			assert.isNotEmpty(row.cells, path);
			assert.isTrue(
				row.cells.some((cell) => (cell?.rejected ?? 0) > 0),
				`${path}: every parser accepts it in full`
			);
		}
	});

	test('the CSS conformance note names the order the table shows', () => {
		// "tsv, a drop-in for Svelte's `parseCss`, sits above it on balance ... PostCSS
		// leads by not parsing selectors, at-rule preludes, or values"
		const coverage = (language: string, name: string): number => {
			const row = derive_conformance_groups(conformance_json)
				.find((g) => g.language === language)
				?.rows.find((r) => r.name === name);
			assert(row, `${language}/${name} is missing`);
			return row.coverage_fraction;
		};
		assert.isAbove(coverage('css', 'PostCSS'), coverage('css', 'tsv'));
		assert.isAbove(coverage('css', 'tsv'), coverage('css', 'svelte/compiler'));
	});

	test('every corpus source links its upstream, at a commit unless the harness harvested it', () => {
		// "Each source links its upstream, at the commit the harness pinned where the
		// report records one" — a suite harvested into a cache records one only when
		// upstream has the harvested commit (not a fork's), so only those may lack it
		const { rows } = derive_corpus_source_table(conformance_json, CONFORMANCE_SOURCE_LABELS);
		for (const row of rows) {
			assert.isDefined(row.url, row.path);
			if (!row.path.includes('/.cache/')) assert.isDefined(row.commit, row.path);
		}
	});

	test("Prettier's CSS fixtures carry no TypeScript/JS files: the spec files are dropped", () => {
		// "From Prettier's suites the harness drops ... the spec files themselves" — the
		// only JS the CSS suite holds is its `format.test.js` harness files, so the suite's
		// TypeScript-language slice is the whole of what that claim removes
		const table = derive_corpus_source_table(conformance_json, CONFORMANCE_SOURCE_LABELS);
		const row = table.rows.find((r) => r.path === '../prettier/tests/format/css');
		assert(row, 'the source is missing');
		assert.strictEqual(row.by_language[table.languages.indexOf('typescript')] ?? 0, 0);
		assert.isAbove(row.by_language[table.languages.indexOf('css')] ?? 0, 0);
	});

	test('the selectors the coverage note names are the hand-stated ones', () => {
		// "svelte/compiler on the Svelte set and `tsc` on the TypeScript compiler's cases"
		assert.deepEqual(
			Object.entries(CONFORMANCE_SELECTORS).map(([group, by_source]) => [
				group,
				Object.values(by_source)
			]),
			[
				['parse/svelte', ['svelte/compiler']],
				['parse/typescript', ['tsc']]
			]
		);
	});
});
