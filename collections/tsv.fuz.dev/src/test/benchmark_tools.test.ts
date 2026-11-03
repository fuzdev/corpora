import { assert, describe, test } from 'vitest';

import {
	derive_tool_footnotes,
	derive_tool_matrix,
	is_tool_cell_timed,
	type ToolSupport
} from '#routes/docs/benchmarks/benchmark_tools.ts';
import {
	CLI_DELIVERY_KEY,
	CLI_SVELTE_KEY,
	type CliScenario
} from '#routes/docs/benchmarks/benchmarks_cli.ts';
import { create_baseline_entry } from './benchmark_test_helpers.ts';

const scenario = (key: string, labels: Array<string>, tsv_only = false): CliScenario => ({
	key,
	heading: key,
	description: '',
	tsv_only,
	target: '',
	corpus: '',
	labels,
	results: labels.map((label) => ({ label, wall_ms: 1, cpu_ms: 1, memory_mb: 1 })),
	warmup_runs: 3,
	benchmark_runs: 10
});

const tool: ToolSupport = {
	name: 'tool',
	languages: {
		typescript: { parse: true, format: 'plugin' },
		jsx: { parse: true },
		svelte: { format: 'experimental' }
	},
	rows: { parse: ['tool-parse'], format: ['tool-fmt'] },
	cli_labels: ['tool-cli']
};

describe('is_tool_cell_timed', () => {
	const no_cli = { scenarios: [] };

	test('a timed row in the matching group marks the cell', () => {
		const baseline = {
			entries: [create_baseline_entry({ name: 'tool-parse', group: 'parse/typescript' })]
		};
		assert.isTrue(is_tool_cell_timed(tool, 'typescript', 'parse', baseline, no_cli));
		assert.isFalse(is_tool_cell_timed(tool, 'typescript', 'format', baseline, no_cli));
		assert.isFalse(is_tool_cell_timed(tool, 'svelte', 'parse', baseline, no_cli));
	});

	test('an untimed row, or a column the report has no group for, marks nothing', () => {
		const baseline = {
			entries: [
				create_baseline_entry({ name: 'tool-parse', group: 'parse/typescript', mean_ns: null }),
				create_baseline_entry({ name: 'tool-parse', group: 'parse/jsx' })
			]
		};
		assert.isFalse(is_tool_cell_timed(tool, 'typescript', 'parse', baseline, no_cli));
		assert.isFalse(is_tool_cell_timed(tool, 'jsx', 'parse', baseline, no_cli));
	});

	test('a CLI scenario over the language marks formatting, but not the tsv-only one', () => {
		const baseline = { entries: [] };
		const timed = (scenarios: Array<CliScenario>) =>
			is_tool_cell_timed(tool, 'svelte', 'format', baseline, { scenarios });
		assert.isTrue(timed([scenario(CLI_SVELTE_KEY, ['tool-cli'])]));
		assert.isFalse(timed([scenario(CLI_SVELTE_KEY, ['other'])]));
		assert.isFalse(timed([scenario(CLI_DELIVERY_KEY, ['tool-cli'], true)]));
		assert.isFalse(
			is_tool_cell_timed(tool, 'svelte', 'parse', baseline, {
				scenarios: [scenario(CLI_SVELTE_KEY, ['tool-cli'])]
			})
		);
	});
});

describe('derive_tool_matrix', () => {
	test('cells list parse before format, carry their footnotes, and stay empty where unsupported', () => {
		const [row] = derive_tool_matrix({ entries: [] }, { scenarios: [] }, [tool]);
		assert.ok(row);
		assert.deepEqual(
			row.cells.typescript.map((c) => [c.operation, c.footnote]),
			[
				['parse', null],
				['format', 'plugin']
			]
		);
		assert.deepEqual(row.cells.css, []);
		assert.deepEqual(derive_tool_footnotes([row]), ['plugin', 'experimental']);
	});
});
