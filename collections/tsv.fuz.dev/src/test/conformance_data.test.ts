import { assert, describe, test } from 'vitest';

import {
	derive_conformance_groups,
	derive_conformance_matrices
} from '#routes/docs/conformance/conformance_data.ts';

import { create_baseline, create_baseline_entry } from './benchmark_test_helpers.ts';

const entry = create_baseline_entry;

describe('derive_conformance_groups', () => {
	const coverage = (name: string, group: string, processed: number | null, total: number | null) =>
		entry({ name, group, files_processed: processed, files_total: total });

	test('rows sort by coverage, under the engine name, with their note', () => {
		const [group, ...rest] = derive_conformance_groups(
			create_baseline({
				entries: [
					coverage('tsv', 'parse/typescript', 90, 100),
					coverage('yuku-parser-wasm', 'parse/typescript', 95, 100),
					// a second binding of an engine, a format row, and a row without counts all drop
					coverage('tsv-wasm', 'parse/typescript', 90, 100),
					coverage('prettier', 'format/typescript', 100, 100),
					coverage('oxc-parser', 'parse/typescript', null, null)
				]
			})
		);
		assert.isEmpty(rest);
		assert(group, 'typescript conformance group missing');
		assert.strictEqual(group.language, 'typescript');
		assert.strictEqual(group.files_total, 100);
		assert.deepEqual(
			group.rows.map((r) => [r.name, r.coverage_fraction]),
			[
				['yuku-parser', 0.95],
				['tsv', 0.9]
			]
		);
		assert.strictEqual(group.rows[0]?.note, 'wasm');
	});

	test('an empty corpus is zero coverage, not NaN', () => {
		const [group] = derive_conformance_groups(
			create_baseline({
				entries: [coverage('tsv', 'parse/css', 0, 0)]
			})
		);
		assert.strictEqual(group?.rows[0]?.coverage_fraction, 0);
	});
});

describe('derive_conformance_matrices', () => {
	const TS_REPO = 'benches/js/.cache/ts_repo_files.json';
	const cell = (processed: number, total: number) => ({ processed, total });
	const coverage = (name: string, group: string, processed: number, total: number) =>
		entry({ name, group, files_processed: processed, files_total: total });

	const typescript_baseline = (sources: Record<string, Record<string, ReturnType<typeof cell>>>) =>
		create_baseline({
			corpus: { svelte: 0, typescript: 100, css: 0 },
			entries: [
				coverage('tsv', 'parse/typescript', 97, 100),
				coverage('tsv-wasm', 'parse/typescript', 97, 100),
				coverage('tsc', 'parse/typescript', 98, 100)
			],
			corpus_sources: [
				{
					path: TS_REPO,
					files: 60,
					repo: {
						url: 'https://github.com/microsoft/TypeScript',
						slug: 'microsoft/TypeScript',
						commit: '',
						subpath: ''
					}
				}
			],
			coverage_by_source: { 'parse/typescript': sources }
		});

	test('a row per source, largest first, with engine-folded cells and the selector flagged', () => {
		const [matrix, ...rest] = derive_conformance_matrices(
			typescript_baseline({
				'../unknown/source': {
					tsv: cell(29, 30),
					'tsv-wasm': cell(29, 30),
					tsc: cell(28, 30)
				},
				[TS_REPO]: { tsv: cell(68, 70), 'tsv-wasm': cell(68, 70), tsc: cell(70, 70) }
			})
		);
		assert.isEmpty(rest);
		assert(matrix, 'typescript matrix missing');
		const [ts_repo, unknown] = matrix.sources;
		assert(ts_repo && unknown, 'two source rows');
		assert.deepEqual(ts_repo.origin, {
			path: TS_REPO,
			label: "TypeScript compiler's cases",
			url: 'https://github.com/microsoft/TypeScript'
		});
		assert.strictEqual(ts_repo.files, 70);
		// a path without a label or a corpus source still gets its row
		assert.deepEqual(unknown.origin, {
			path: '../unknown/source',
			label: undefined,
			url: undefined
		});
		// tsc selected its compiler's cases, so only its cell there is flagged
		assert.deepEqual(
			matrix.engines.map((e, i) => [e.name, ts_repo.cells[i]?.selected]),
			[
				['tsv', false],
				['tsc', true]
			]
		);
	});

	test("the aggregate leaves out a selected source, and the columns follow what's left", () => {
		// tsc leads the whole group (98 to 97) only through the source it selected;
		// without it tsv leads, so the columns reorder away from the group's order
		const [matrix] = derive_conformance_matrices(
			typescript_baseline({
				'../unknown/source': { tsv: cell(29, 30), tsc: cell(28, 30) },
				[TS_REPO]: { tsv: cell(68, 70), tsc: cell(70, 70) }
			})
		);
		assert(matrix?.aggregate, 'no aggregate');
		assert.deepEqual(
			matrix.aggregate.excluded.map((o) => o.path),
			[TS_REPO]
		);
		assert.strictEqual(matrix.aggregate.files, 30);
		assert.deepEqual(
			matrix.engines.map((e, i) => [e.name, matrix.aggregate?.cells[i]?.processed]),
			[
				['tsv', 29],
				['tsc', 28]
			]
		);
		assert.isFalse(matrix.aggregate.cells.some((c) => c?.selected));
	});

	test('an engine that selected every source leaves no aggregate, and the group order stands', () => {
		const [matrix] = derive_conformance_matrices(
			create_baseline({
				entries: [
					coverage('svelte/compiler', 'parse/svelte', 5, 5),
					coverage('tsv', 'parse/svelte', 4, 5)
				],
				coverage_by_source: {
					'parse/svelte': { '../a': { 'svelte/compiler': cell(5, 5), tsv: cell(4, 5) } }
				}
			})
		);
		assert.isUndefined(matrix?.aggregate);
		assert.deepEqual(
			matrix?.engines.map((e) => e.name),
			['svelte/compiler', 'tsv']
		);
	});

	test('a report without per-source coverage falls back to the group totals', () => {
		const [matrix] = derive_conformance_matrices(
			create_baseline({ entries: [coverage('tsv', 'parse/css', 4, 5)] })
		);
		assert.isEmpty(matrix?.sources);
		assert.isEmpty(matrix?.aggregate?.excluded);
		assert.strictEqual(matrix?.aggregate?.cells[0]?.rejected, 1);
	});
});
