import { assert, describe, test } from 'vitest';

import { benchmarks_json } from '#routes/docs/benchmarks/benchmarks.ts';
import { conformance_json } from '#routes/docs/conformance/conformance.ts';
import { benchmarks_cross_runtime_json } from '#routes/docs/benchmarks/benchmarks_cross_runtime.ts';
import {
	derive_cross_runtime_groups,
	is_impl_unavailable
} from '#routes/docs/benchmarks/benchmark_cross_runtime.ts';

// The combined report shape the committed copy is pinned to — tsv's composer's
// `COMBINED_SCHEMA_VERSION`. Exact rather than a floor, so `npm run
// update-benchmarks` pulling a newer shape fails here until
// `benchmark_cross_runtime.ts` mirrors the new fields and this is re-pinned.
const COMBINED_VERSION = 18;

// Shape gate for the committed cross-runtime `benchmarks_cross_runtime.json` (the
// bench composer's combined `report.json`) — a different, slimmer shape than the
// per-runtime baseline, consumed by the Cross-runtime section.
describe('benchmarks_cross_runtime.json shape', () => {
	test('combined report carries the current version and kind', () => {
		assert.strictEqual(benchmarks_cross_runtime_json.version, COMBINED_VERSION);
		assert.strictEqual(benchmarks_cross_runtime_json.kind, 'combined');
		// the committed fixture must be same-vintage — if this trips, re-run every
		// runtime and recompose rather than committing a mixed set, which the site
		// has no banner for
		assert.notStrictEqual(benchmarks_cross_runtime_json.mixed_vintage, true);
	});

	test('the conformance report is same-vintage with the perf siblings', () => {
		// the combined report records it; a stale one means `update-benchmarks`
		// copied a conformance report from a different refresh than the perf trio,
		// which the site has no banner for
		const vintage = benchmarks_cross_runtime_json.conformance_vintage;
		assert.isOk(vintage, 'conformance_vintage recorded');
		assert.notStrictEqual(vintage.stale, true);
		assert.strictEqual(vintage.git_commit, conformance_json.git_commit);
	});

	test('the flagship report is the node sibling the combined report was composed from', () => {
		// `update-benchmarks` copies three files from one `deno task bench`; if a copy
		// is skipped or taken from another worktree, the detailed view and the
		// cross-runtime tables silently describe different builds. The composer
		// can't see the copied files, so this is the site-side vintage gate
		const node = benchmarks_cross_runtime_json.sources.find((s) => s.runtime === 'node');
		assert.isOk(node, 'combined report carries a node source');
		assert.strictEqual(node.git_commit, benchmarks_json.git_commit);
		assert.strictEqual(node.timestamp, benchmarks_json.timestamp);
		assert.strictEqual(node.tsv, benchmarks_json.versions.tsv);
	});

	test('runtimes include the flagship and its cross-runtime peers', () => {
		const { runtimes } = benchmarks_cross_runtime_json;
		assert.include(runtimes, 'node'); // the flagship the headline view leads with
		assert.include(runtimes, 'deno');
		assert.include(runtimes, 'bun');
	});

	test('every group derives rows with the flagship runtime populated', () => {
		const groups = derive_cross_runtime_groups(benchmarks_cross_runtime_json);
		assert.isAtLeast(groups.length, 6); // format+parse × svelte/typescript/css
		for (const group of groups) {
			assert.isAbove(group.rows.length, 0, group.group);
			for (const row of group.rows) {
				assert.isNumber(row.ops_per_second.node, `${group.group}/${row.name} missing node ops`);
				// ratios anchor on node (the display-order base, not the report's
				// deno-first storage order), so node's own ratio is exactly 1
				assert.strictEqual(row.ratio_vs_base.node, 1, `${group.group}/${row.name} node anchor`);
				// the tables print `mean_ns` beside ratios taken over `ops_per_second`,
				// so the two must be one measurement
				for (const [runtime, ops] of Object.entries(row.ops_per_second)) {
					const mean = row.mean_ns[runtime as keyof typeof row.mean_ns];
					assert(mean !== undefined, `${group.group}/${row.name} missing ${runtime} mean`);
					assert.approximately(ops * mean, 1e9, 1e3, `${group.group}/${row.name} ${runtime}`);
				}
			}
		}
	});

	test('the committed reports timed identical file sets across runtimes', () => {
		// a mismatch means part of a published ratio is corpus composition, not
		// runtime, and the site has no annotation for it — recompose from same-box,
		// same-commit siblings. Every runtime must have reported a count for every
		// row it could load, or the comparison would pass with nothing compared; a
		// recorded load failure is the one gap, which the section discloses.
		assert.isNotEmpty(benchmarks_cross_runtime_json.rows);
		for (const row of benchmarks_cross_runtime_json.rows) {
			for (const runtime of benchmarks_cross_runtime_json.runtimes) {
				if (is_impl_unavailable(benchmarks_cross_runtime_json, runtime, row.name)) continue;
				assert.isNumber(row.files_iterated[runtime], `${row.group}/${row.name} ${runtime}`);
			}
			assert.lengthOf(
				[...new Set(Object.values(row.files_iterated))],
				1,
				`${row.group}/${row.name} file-set mismatch`
			);
		}
	});
});
