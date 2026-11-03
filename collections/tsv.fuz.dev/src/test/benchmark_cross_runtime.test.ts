import { assert, describe, test } from 'vitest';

import {
	derive_cross_runtime_groups,
	cross_runtime_ratio_background,
	derive_runtime_leads,
	derive_runtime_versions,
	derive_unavailable_by_runtime,
	derive_unstable_cells,
	format_cross_runtime_label,
	is_cell_unstable,
	is_impl_unavailable,
	is_ratio_within_noise,
	order_cross_runtime_runtimes,
	type BenchmarkRuntime,
	type CrossRuntimeReport,
	type UnstableCell
} from '#routes/docs/benchmarks/benchmark_cross_runtime.ts';

// a minimal healthy combined report, which each suite overrides the one field it reads
const create_report = (overrides: Partial<CrossRuntimeReport> = {}): CrossRuntimeReport => ({
	version: 15,
	kind: 'combined',
	generated: '2026-01-01T00:00:00.000Z',
	runtimes: ['deno', 'node', 'bun'],
	mixed_vintage: false,
	mixed_machine: false,
	unavailable_by_runtime: [],
	partial_rows: [],
	within_noise: [],
	unstable_cells: [],
	conformance_vintage: null,
	sources: [],
	rows: [],
	...overrides
});

describe('derive_runtime_leads', () => {
	const row = (name: string, mean_ns: Partial<Record<BenchmarkRuntime, number>>) => ({
		group: 'parse/css',
		name,
		ops_per_second: {},
		mean_ns,
		files_iterated: {}
	});

	test('names the non-base runtimes where the faster row leads, with the slower row against base', () => {
		const report = create_report({
			rows: [
				row('svelte/compiler', { node: 10, deno: 10, bun: 20 }),
				row('tsv', { node: 20, deno: 16, bun: 16 })
			]
		});
		assert.deepStrictEqual(derive_runtime_leads(report, 'parse/css', 'svelte/compiler', 'tsv'), [
			{ runtime: 'bun', ratio: 1.25, slower_vs_base: 2 }
		]);
	});

	test('is empty when a row or a runtime time is missing', () => {
		const report = create_report({
			rows: [row('svelte/compiler', { node: 10, bun: 20 }), row('tsv', { node: 20 })]
		});
		assert.deepStrictEqual(derive_runtime_leads(report, 'parse/css', 'svelte/compiler', 'tsv'), []);
		assert.deepStrictEqual(derive_runtime_leads(report, 'parse/css', 'absent', 'tsv'), []);
	});
});

describe('order_cross_runtime_runtimes', () => {
	test('reorders the report storage order to node-first display order', () => {
		assert.deepStrictEqual(order_cross_runtime_runtimes(['deno', 'node', 'bun']), [
			'node',
			'deno',
			'bun'
		]);
	});

	test('anchors on the next runtime in display order when node is absent', () => {
		assert.deepStrictEqual(order_cross_runtime_runtimes(['bun', 'deno']), ['deno', 'bun']);
		assert.deepStrictEqual(order_cross_runtime_runtimes([]), []);
	});
});

// Per-runtime load failures (the composer's `unavailable_by_runtime`). Synthetic reports: the committed one records no failures, and the
// point of these is the DISTINCTION the field draws — a runtime that couldn't load
// the impl behind a row versus a report that simply has no such row. Both render
// as `fail`.
describe('derive_unavailable_by_runtime', () => {
	const report = (unavailable_by_runtime: CrossRuntimeReport['unavailable_by_runtime']) =>
		create_report({ unavailable_by_runtime });

	test('lists each runtime in the site column order, not the report storage order', () => {
		// the report stores deno-first; the tables read node-first, and a disclosure
		// listing runtimes in a different order than the columns invites misreading
		const derived = derive_unavailable_by_runtime(
			report([
				{ runtime: 'bun', rows: ['biome-wasm', 'oxc-parser-wasm'] },
				{ runtime: 'node', rows: ['biome-wasm'] }
			])
		);
		assert.deepStrictEqual(
			derived.map((entry) => entry.runtime),
			['node', 'bun']
		);
	});

	test('an empty row list is not a disclosure', () => {
		assert.isEmpty(derive_unavailable_by_runtime(report([{ runtime: 'bun', rows: [] }])));
	});

	test('is_impl_unavailable answers per runtime', () => {
		// keyed by ROW name (`biome-wasm`), which is what the tables render — the
		// bench's init label (`Biome`) would match no cell
		const recorded = report([{ runtime: 'bun', rows: ['biome-wasm'] }]);
		assert.isTrue(is_impl_unavailable(recorded, 'bun', 'biome-wasm'));
		assert.isFalse(is_impl_unavailable(recorded, 'node', 'biome-wasm'));
		assert.isFalse(is_impl_unavailable(recorded, 'bun', 'oxfmt'));
	});
});

describe('derive_cross_runtime_groups', () => {
	const row = (
		group: string,
		name: string,
		ops_per_second: CrossRuntimeReport['rows'][number]['ops_per_second']
	): CrossRuntimeReport['rows'][number] => ({
		group,
		name,
		ops_per_second,
		mean_ns: {},
		files_iterated: {}
	});

	test('ratios anchor on node whatever the storage order, and a missing side has none', () => {
		const [group] = derive_cross_runtime_groups(
			create_report({
				rows: [
					row('format/css', 'tsv', { deno: 30, node: 20, bun: 10 }),
					row('format/css', 'biome-wasm', { deno: 5, node: 4 })
				]
			})
		);
		assert(group);
		assert.deepStrictEqual(group.rows[0]?.ratio_vs_base, { node: 1, deno: 1.5, bun: 0.5 });
		assert.deepStrictEqual(group.rows[1]?.ratio_vs_base, { node: 1, deno: 1.25 });
		assert.strictEqual(group.rows[1]?.category, 'biome');
	});

	test('a row the base runtime never measured has no ratios at all', () => {
		const [group] = derive_cross_runtime_groups(
			create_report({ rows: [row('format/css', 'tsv', { deno: 30, bun: 10 })] })
		);
		assert.deepStrictEqual(group?.rows[0]?.ratio_vs_base, {});
	});

	test('groups read format before parse, then svelte, typescript, css', () => {
		const groups = derive_cross_runtime_groups(
			create_report({
				rows: [
					row('parse/css', 'tsv', { node: 1 }),
					row('format/typescript', 'tsv', { node: 1 }),
					row('parse/svelte', 'tsv', { node: 1 }),
					row('format/svelte', 'tsv', { node: 1 })
				]
			})
		);
		assert.deepStrictEqual(
			groups.map((g) => g.group),
			['format/svelte', 'format/typescript', 'parse/svelte', 'parse/css']
		);
	});
});

describe('derive_unstable_cells', () => {
	const cell = (runtime: BenchmarkRuntime): UnstableCell => ({
		group: 'format/css',
		name: 'tsv',
		runtime,
		cv: 0.2,
		cv_raw: null,
		drift: null,
		samples: 10
	});
	const report = (unstable_cells: Array<UnstableCell>) => create_report({ unstable_cells });

	test('lists cells in the site column order, not the report storage order', () => {
		const derived = derive_unstable_cells(report([cell('bun'), cell('deno'), cell('node')]));
		assert.deepStrictEqual(
			derived.map((c) => c.runtime),
			['node', 'deno', 'bun']
		);
	});

	test('does not reorder the report in place', () => {
		const cells = [cell('bun'), cell('node')];
		derive_unstable_cells(report(cells));
		assert.deepStrictEqual(
			cells.map((c) => c.runtime),
			['bun', 'node']
		);
	});

	test('is_cell_unstable matches group, row, and runtime together', () => {
		const r = report([cell('bun')]);
		assert.isTrue(is_cell_unstable(r, 'format/css', 'tsv', 'bun'));
		assert.isFalse(is_cell_unstable(r, 'format/css', 'tsv', 'node'));
		assert.isFalse(is_cell_unstable(r, 'parse/css', 'tsv', 'bun'));
		assert.isFalse(is_cell_unstable(r, 'format/css', 'tsv-wasm', 'bun'));
	});
});

describe('is_ratio_within_noise', () => {
	const report = (within_noise: CrossRuntimeReport['within_noise']) =>
		create_report({ within_noise });

	test('a pairwise cell matches the ratio between exactly its two runtimes, either way round', () => {
		const r = report([
			{
				group: 'format/css',
				name: 'oxfmt',
				runtimes: ['deno', 'node'],
				delta: 0.01,
				noise: 0.04,
				samples: [10, 10]
			}
		]);
		assert.isTrue(is_ratio_within_noise(r, 'format/css', 'oxfmt', 'node', 'deno'));
		assert.isTrue(is_ratio_within_noise(r, 'format/css', 'oxfmt', 'deno', 'node'));
		assert.isFalse(is_ratio_within_noise(r, 'format/css', 'oxfmt', 'node', 'bun'));
		assert.isFalse(is_ratio_within_noise(r, 'format/css', 'tsv', 'node', 'deno'));
		assert.isFalse(is_ratio_within_noise(r, 'parse/css', 'oxfmt', 'node', 'deno'));
	});
});

describe('derive_runtime_versions', () => {
	test('reads each source machine in display order, dropping sources without one', () => {
		const machine = (runtime_version: string) => ({
			cpu_model: 'cpu',
			os: 'linux',
			arch: 'x64',
			runtime_version
		});
		const source = (runtime: BenchmarkRuntime, m: ReturnType<typeof machine> | null) => ({
			runtime,
			timestamp: '2026-01-01T00:00:00.000Z',
			git_commit: null,
			tsv: null,
			corpus_snapshot: null,
			machine: m,
			unavailable: null
		});
		const versions = derive_runtime_versions(
			create_report({
				sources: [
					source('deno', machine('2.5.0')),
					source('node', machine('24.14.1')),
					source('bun', null)
				]
			})
		);
		assert.deepStrictEqual(versions, [
			{ runtime: 'node', version: '24.14.1' },
			{ runtime: 'deno', version: '2.5.0' }
		]);
	});
});

describe('format_cross_runtime_label', () => {
	test('neutralizes the node-specific binding suffix, leaving other labels alone', () => {
		assert.strictEqual(format_cross_runtime_label('tsv+locations'), 'tsv+locations (native)');
		assert.strictEqual(format_cross_runtime_label('biome-wasm'), 'biome (wasm)');
		assert.strictEqual(format_cross_runtime_label('prettier'), 'prettier');
	});
});

describe('cross_runtime_ratio_background', () => {
	test('parity is transparent, and alpha saturates at a 20% delta either way', () => {
		assert.include(cross_runtime_ratio_background(1), ' 0.0%,');
		assert.include(cross_runtime_ratio_background(1.1), 'var(--palette_b_50) 15.0%,');
		assert.include(cross_runtime_ratio_background(1.2), 'var(--palette_b_50) 30.0%,');
		assert.include(cross_runtime_ratio_background(3), 'var(--palette_b_50) 30.0%,');
		assert.include(cross_runtime_ratio_background(0.5), 'var(--palette_c_50) 30.0%,');
	});
});
