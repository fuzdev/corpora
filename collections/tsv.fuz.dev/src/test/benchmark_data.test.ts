import { assert, describe, test } from 'vitest';

import {
	benchmark_time_share_beyond,
	derive_benchmark_groups,
	derive_corpus_counts,
	derive_corpus_origin_shares,
	derive_corpus_source_table,
	derive_slow_row_groups,
	derive_sweep_stats,
	derive_unstable_entries,
	entry_instability,
	is_entry_unstable,
	is_payload_matched,
	parse_group_key,
	type BaselineEntry,
	type BenchmarkBaseline
} from '#routes/docs/benchmarks/benchmark_data.ts';

import { create_baseline, create_baseline_entry } from './benchmark_test_helpers.ts';

describe('derive_corpus_origin_shares', () => {
	test('is null for a report that records no origins', () => {
		assert.isNull(derive_corpus_origin_shares(create_baseline()));
	});

	test('gives each language its third-party byte share, leaving empty languages out', () => {
		const baseline: BenchmarkBaseline = {
			...create_baseline(),
			corpus: { svelte: 3, typescript: 2, css: 0 },
			corpus_by_origin: {
				own: {
					svelte: { files: 2, bytes: 300 },
					typescript: { files: 1, bytes: 0 },
					css: { files: 0, bytes: 0 }
				},
				third_party: {
					svelte: { files: 1, bytes: 100 },
					typescript: { files: 1, bytes: 50 },
					css: { files: 0, bytes: 0 }
				}
			}
		};
		const shares = derive_corpus_origin_shares(baseline);
		assert.deepEqual(
			shares?.map((s) => [s.language, s.third_party_share]),
			[
				['svelte', 0.25],
				['typescript', 1]
			]
		);
		assert.deepEqual(shares?.[0]?.own, { files: 2, bytes: 300 });
	});
});

describe('derive_corpus_source_table', () => {
	const ref = (
		slug: string,
		subpath: string,
		commit = '0123456789abcdef0123456789abcdef01234567'
	) => ({
		url: `https://github.com/${slug}`,
		slug,
		commit,
		subpath
	});

	test('itemizes the sources in report order with the report totals alongside', () => {
		const table = derive_corpus_source_table(
			create_baseline({
				corpus: { svelte: 3, typescript: 4, css: 2 },
				corpus_sources: [
					{
						path: '../corpora/collections/zzz/src',
						files: 5,
						by_language: { svelte: 3, typescript: 2, css: 0 },
						repo: ref('fuzdev/zzz', 'src')
					},
					{ path: 'benches/js/.cache/styles', files: 2, by_language: { css: 2 } },
					{ path: '../old/src', files: 2 }
				]
			}),
			{ 'benches/js/.cache/styles': 'harvested styles' }
		);
		assert.deepStrictEqual(table.languages, ['svelte', 'typescript', 'css']);
		assert.deepStrictEqual(table.totals, { files: 9, by_language: [3, 4, 2] });
		assert.deepStrictEqual(table.rows, [
			{
				path: '../corpora/collections/zzz/src',
				label: 'fuzdev/zzz',
				subpath: undefined,
				url: 'https://github.com/fuzdev/zzz/tree/0123456789abcdef0123456789abcdef01234567/src',
				commit: '0123456',
				files: 5,
				by_language: [3, 2, 0]
			},
			// no repo: the hand label names it, and a language the split omits stays unknown
			{
				path: 'benches/js/.cache/styles',
				label: 'harvested styles',
				subpath: undefined,
				url: undefined,
				commit: undefined,
				files: 2,
				by_language: [undefined, undefined, 2]
			},
			// neither repo nor label: the raw path, and no split at all
			{
				path: '../old/src',
				label: '../old/src',
				subpath: undefined,
				url: undefined,
				commit: undefined,
				files: 2,
				by_language: [undefined, undefined, undefined]
			}
		]);
	});

	test('a subpath tells apart only the unlabeled sources sharing a repo', () => {
		const table = derive_corpus_source_table(
			create_baseline({
				corpus_sources: [
					{ path: 'a', files: 1, repo: ref('sveltejs/svelte.dev', 'apps/svelte.dev/src') },
					{ path: 'b', files: 1, repo: ref('sveltejs/svelte.dev', 'packages/repl/src') },
					{ path: 'c', files: 1, repo: ref('sveltejs/kit', 'packages/kit/src') },
					{ path: 'd', files: 1, repo: ref('prettier/prettier', 'tests/format/js') },
					{ path: 'e', files: 1, repo: ref('prettier/prettier', 'tests/format/css') }
				]
			}),
			{ d: "Prettier's JS fixtures" }
		);
		assert.deepStrictEqual(
			table.rows.map((row) => [row.label, row.subpath]),
			[
				['sveltejs/svelte.dev', 'apps/svelte.dev/src'],
				['sveltejs/svelte.dev', 'packages/repl/src'],
				['sveltejs/kit', undefined],
				["Prettier's JS fixtures", undefined],
				// the labeled sibling already reads apart, so this one needs no subpath
				['prettier/prettier', undefined]
			]
		);
	});

	test('an unpinned repo links its root and shows no commit', () => {
		const table = derive_corpus_source_table(
			create_baseline({
				corpus_sources: [{ path: 'a', files: 1, repo: ref('tc39/test262', '', '') }]
			})
		);
		assert.strictEqual(table.rows[0]?.url, 'https://github.com/tc39/test262');
		assert.isUndefined(table.rows[0]?.commit);
	});
});

const entry = create_baseline_entry;

describe('entry_instability', () => {
	test('is undefined for a stable row', () => {
		assert.isUndefined(entry_instability(entry({})));
	});

	test('is the worst reading past its threshold', () => {
		assert.strictEqual(entry_instability(entry({ drift: -0.06, pass_spread: 0.08 })), 0.08);
		assert.strictEqual(entry_instability(entry({ drift: -0.06, pass_spread: 0.01 })), 0.06);
	});
});

describe('is_entry_unstable', () => {
	test('a clean row is stable', () => {
		assert.isFalse(is_entry_unstable(entry({})));
	});

	test('a cleaned cv at the threshold is unstable', () => {
		assert.isTrue(is_entry_unstable(entry({ cv: 0.1 })));
	});

	test('a raw cv past the threshold counts only on a small sample', () => {
		assert.isTrue(is_entry_unstable(entry({ cv_raw: 0.2, raw_sample_size: 29 })));
		assert.isFalse(is_entry_unstable(entry({ cv_raw: 0.2, raw_sample_size: 30 })));
	});

	test('the raw-cv sample ceiling is per pass', () => {
		// three floor-bound passes of 8 pool to 24 raw timings, and so do four of 8 to 32:
		// the line can't move with the pass count
		assert.isTrue(is_entry_unstable(entry({ cv_raw: 0.2, raw_sample_size: 32, passes: 4 })));
		assert.isFalse(is_entry_unstable(entry({ cv_raw: 0.2, raw_sample_size: 90, passes: 3 })));
	});

	test('a pass spread at the threshold is unstable, below it is not', () => {
		assert.isTrue(is_entry_unstable(entry({ pass_spread: 0.05 })));
		assert.isFalse(is_entry_unstable(entry({ pass_spread: 0.049 })));
		assert.isFalse(is_entry_unstable(entry({ pass_spread: null })));
	});

	test('drift counts in either direction', () => {
		assert.isTrue(is_entry_unstable(entry({ drift: -0.05 })));
		assert.isTrue(is_entry_unstable(entry({ drift: 0.07 })));
		assert.isFalse(is_entry_unstable(entry({ drift: -0.049 })));
	});

	test('an untimed row is not unstable, and missing raw fields are silence', () => {
		assert.isFalse(is_entry_unstable(entry({ cv: null, mean_ns: null })));
		assert.isFalse(is_entry_unstable(entry({ cv: null, mean_ns: null, drift: 0.4 })));
		assert.isFalse(is_entry_unstable(entry({ cv_raw: null, drift: null, raw_sample_size: null })));
	});

	test('a timed row missing only its cleaned cv is still checked by drift and raw cv', () => {
		assert.isTrue(is_entry_unstable(entry({ cv: null, drift: 0.4 })));
		assert.isTrue(is_entry_unstable(entry({ cv: null, cv_raw: 0.5, raw_sample_size: 10 })));
		assert.isFalse(is_entry_unstable(entry({ cv: null })));
	});
});

describe('derive_unstable_entries', () => {
	const baseline = (entries: Array<BaselineEntry>): BenchmarkBaseline =>
		({ entries }) as unknown as BenchmarkBaseline;

	test('keeps only the unstable rows, worst reading first across cv, raw cv, and |drift|', () => {
		const derived = derive_unstable_entries(
			baseline([
				entry({ name: 'clean' }),
				entry({ name: 'cv', cv: 0.12 }),
				entry({ name: 'drift', drift: -0.3 }),
				entry({ name: 'raw', cv_raw: 0.2, raw_sample_size: 10 })
			])
		);
		assert.deepStrictEqual(
			derived.map((e) => e.name),
			['drift', 'raw', 'cv']
		);
	});

	test('a raw cv its sample size excuses does not rank the row', () => {
		// `excused` is flagged by its drift alone, so its large-sample raw cv says nothing
		const derived = derive_unstable_entries(
			baseline([
				entry({ name: 'excused', drift: 0.11, cv_raw: 0.9, raw_sample_size: 100 }),
				entry({ name: 'cv', cv: 0.12 })
			])
		);
		assert.deepStrictEqual(
			derived.map((e) => e.name),
			['cv', 'excused']
		);
	});
});

describe('derive_slow_row_groups', () => {
	const baseline = (entries: Array<BaselineEntry>): BenchmarkBaseline =>
		({ entries }) as unknown as BenchmarkBaseline;
	// a floor of 8 per pass over 3 passes: slow is under 2 × 24 = 48 raw timings
	const timed = (overrides: Partial<BaselineEntry>) =>
		entry({ min_iterations: 8, passes: 3, ...overrides });

	test('keeps rows under twice the floor, by group in page order, marking a group all slow', () => {
		const derived = derive_slow_row_groups(
			baseline([
				timed({ group: 'parse/typescript', name: 'fast', raw_sample_size: 48 }),
				timed({ group: 'parse/typescript', name: 'slow', raw_sample_size: 47 }),
				timed({ group: 'format/typescript', name: 'a', raw_sample_size: 24 }),
				timed({ group: 'format/typescript', name: 'b', raw_sample_size: 30 }),
				timed({ group: 'format/css', name: 'quick', raw_sample_size: 900 })
			])
		);
		assert.deepStrictEqual(derived, [
			{ group: 'format/typescript', names: ['a', 'b'], every: true },
			{ group: 'parse/typescript', names: ['slow'], every: false }
		]);
	});

	test('skips untimed rows, so a coverage-only row neither counts nor breaks `every`', () => {
		const derived = derive_slow_row_groups(
			baseline([
				timed({ group: 'format/svelte', name: 'slow', raw_sample_size: 24 }),
				timed({ group: 'format/svelte', name: 'coverage', mean_ns: null, raw_sample_size: 0 })
			])
		);
		assert.deepStrictEqual(derived, [{ group: 'format/svelte', names: ['slow'], every: true }]);
	});
});

describe('derive_benchmark_groups omissions', () => {
	const baseline = (omissions: BenchmarkBaseline['omissions']): BenchmarkBaseline =>
		create_baseline({
			entries: [
				entry({ name: 'prettier', group: 'format/css' }),
				entry({ name: 'biome-wasm', group: 'format/css' })
			],
			omissions
		});
	const css_omissions = {
		group: 'format/css',
		files_total: 55,
		bytes_total: 378_000,
		omitted_files: 1,
		omitted_bytes: 41_125,
		by_tool: [{ name: 'biome-wasm', files: 1, bytes: 41_125, categories: { harvest_artifact: 1 } }]
	};

	test('a group carries the omissions reported under its key', () => {
		const [group] = derive_benchmark_groups(baseline([css_omissions]));
		assert.deepEqual(group?.omissions, css_omissions);
	});

	test('nothing omitted, another group, and an older report all read as null', () => {
		const none = { ...css_omissions, omitted_files: 0, omitted_bytes: 0, by_tool: [] };
		for (const omissions of [[none], [{ ...css_omissions, group: 'parse/css' }], undefined]) {
			const [group] = derive_benchmark_groups(baseline(omissions));
			assert.isNull(group?.omissions);
		}
	});
});

describe('derive_benchmark_groups placeholders state a scope gap only', () => {
	const groups = derive_benchmark_groups(
		create_baseline({
			entries: [
				entry({ name: 'prettier', group: 'format/svelte' }),
				entry({ name: 'dprint-wasm', group: 'format/typescript' }),
				entry({ name: 'svelte/compiler', group: 'parse/svelte' }),
				entry({ name: 'svelte/compiler', group: 'parse/css' }),
				entry({ name: 'oxc-parser', group: 'parse/typescript' }),
				entry({ name: 'yuku-parser', group: 'parse/typescript' })
			]
		})
	);
	const disabled = (operation: string, language: string) =>
		groups
			.find((g) => g.operation === operation && g.language === language)
			?.entries.filter((e) => e.disabled)
			.map((e) => e.name);

	test('a TypeScript-only plugin is not mirrored into the svelte format group', () => {
		assert.deepEqual(disabled('format', 'svelte'), []);
	});

	test('oxc-parser and swc hold one slot each in the css parse group, never the svelte one', () => {
		assert.deepEqual(disabled('parse', 'css'), ['biome-wasm', 'oxc-parser', 'swc']);
		assert.deepEqual(disabled('parse', 'svelte'), ['biome-wasm']);
	});

	test('biome holds one in every parse group', () => {
		assert.deepEqual(disabled('parse', 'typescript'), ['biome-wasm']);
	});
});

describe('to_placeholder via derive_benchmark_groups', () => {
	test('a mirrored row carries nothing its template measured', () => {
		const groups = derive_benchmark_groups(
			create_baseline({
				entries: [
					entry({ name: 'svelte/compiler', group: 'parse/css' }),
					entry({
						name: 'oxc-parser',
						group: 'parse/typescript',
						mean_ns: 9_000,
						files_processed: 7
					})
				]
			})
		);
		const css = groups.find((g) => g.language === 'css');
		const mirrored = css?.entries.find((e) => e.name === 'oxc-parser');
		assert.deepEqual(mirrored, {
			name: 'oxc-parser',
			category: 'oxc',
			mean_ns: 0,
			bar_fraction: 0,
			files_processed: null,
			files_total: null,
			disabled: true
		});
	});
});

describe('derive_corpus_counts', () => {
	const baseline = (corpus_sources: BenchmarkBaseline['corpus_sources']): BenchmarkBaseline =>
		create_baseline({
			corpus: { svelte: 10, typescript: 20, css: 5 },
			corpus_sources
		});

	test('the harvest is the CSS of the sources with no upstream repo', () => {
		const counts = derive_corpus_counts(
			baseline([
				{
					path: 'a',
					files: 12,
					repo: { slug: 'fuzdev/a', commit: 'abc' },
					by_language: { css: 2 }
				},
				{ path: '.cache/svelte_styles', files: 3, by_language: { css: 3 } }
			] as BenchmarkBaseline['corpus_sources'])
		);
		assert.deepEqual(counts, { files: 35, harvested_css: 3, standalone_css: 2 });
	});

	test('a report that does not distinguish the harvest quotes no standalone count', () => {
		assert.deepEqual(derive_corpus_counts(baseline([])), {
			files: 35,
			harvested_css: 0,
			standalone_css: undefined
		});
	});
});

describe('derive_sweep_stats', () => {
	test('the floor, the passes, the kept-timing span and the largest drift', () => {
		const stats = derive_sweep_stats(
			create_baseline({
				entries: [
					entry({ name: 'prettier', passes: 3, sample_size: 24, drift: 0.004 }),
					entry({ name: 'tsv', passes: 3, sample_size: 900, drift: -0.012 }),
					entry({ name: 'biome-wasm', passes: 3, sample_size: 23, drift: null })
				]
			})
		);
		assert.deepEqual(stats, {
			floor: 8,
			passes: 3,
			sample_size_min: 23,
			sample_size_max: 900,
			drift_max: 0.012
		});
	});

	test('a report from before passes reads no pass count', () => {
		const stats = derive_sweep_stats(create_baseline({ entries: [entry({})] }));
		assert.isUndefined(stats.passes);
	});

	test('a report with only untimed rows reads as undefined, never Infinity', () => {
		const stats = derive_sweep_stats(
			create_baseline({
				entries: [entry({ sample_size: null, min_iterations: null, drift: null })]
			})
		);
		assert.deepEqual(stats, {
			floor: undefined,
			passes: undefined,
			sample_size_min: undefined,
			sample_size_max: undefined,
			drift_max: undefined
		});
	});
});

describe('benchmark_time_share_beyond', () => {
	const baseline: BenchmarkBaseline = create_baseline({
		entries: [
			entry({ name: 'tsv', group: 'parse/css', mean_ns: 100 }),
			entry({ name: 'tsv-internal', group: 'parse/css', mean_ns: 20 })
		]
	});

	test('is what the whole row spends beyond the part', () => {
		assert.closeTo(
			benchmark_time_share_beyond(baseline, 'parse/css', 'tsv', 'tsv-internal')!,
			0.8,
			1e-9
		);
	});

	test('a missing row has no share', () => {
		assert.isUndefined(benchmark_time_share_beyond(baseline, 'parse/css', 'tsv', 'nope'));
	});
});

describe('is_payload_matched', () => {
	test('equal tiers match, except own_shape — two dialects are two products', () => {
		assert.isTrue(is_payload_matched({ payload: 'drop_in' }, { payload: 'drop_in' }));
		assert.isTrue(is_payload_matched({ payload: 'span_only' }, { payload: 'span_only' }));
		assert.isFalse(is_payload_matched({ payload: 'drop_in' }, { payload: 'span_only' }));
		assert.isFalse(is_payload_matched({ payload: 'own_shape' }, { payload: 'own_shape' }));
	});

	test('a superset matches only another superset — never the exact drop-in', () => {
		assert.isTrue(
			is_payload_matched({ payload: 'drop_in_superset' }, { payload: 'drop_in_superset' })
		);
		assert.isFalse(is_payload_matched({ payload: 'drop_in_superset' }, { payload: 'drop_in' }));
		assert.isFalse(is_payload_matched({ payload: 'drop_in_superset' }, { payload: 'span_only' }));
	});

	test('a row with no tier makes the question unanswerable, not false', () => {
		assert.isNull(is_payload_matched({ payload: null }, { payload: 'drop_in' }));
	});
});

describe('parse_group_key', () => {
	test('splits an operation/language key', () => {
		assert.deepStrictEqual(parse_group_key('format/svelte'), {
			operation: 'format',
			language: 'svelte'
		});
	});

	test('a key missing its language yields an empty one rather than undefined', () => {
		assert.deepStrictEqual(parse_group_key('format'), { operation: 'format', language: '' });
	});
});
