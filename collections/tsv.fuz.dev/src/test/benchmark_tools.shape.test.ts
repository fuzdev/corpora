import { assert, describe, test } from 'vitest';

import { benchmarks_json } from '#routes/docs/benchmarks/benchmarks.ts';
import { benchmarks_cli, cli_label_is_tsv } from '#routes/docs/benchmarks/benchmarks_cli.ts';
import {
	CLI_SCENARIO_LANGUAGES,
	TOOL_LANGUAGES,
	TOOL_SUPPORT,
	type ToolLanguage,
	type ToolOperation
} from '#routes/docs/benchmarks/benchmark_tools.ts';

// The matrix's capabilities are hand-stated and its timed marks read the reports,
// so these hold the two together: a renamed or added report row can't leave the
// matrix silently unmarked or incomplete.
describe('the language-support matrix reads the reports', () => {
	const timed_entries = benchmarks_json.entries.filter((e) => e.mean_ns != null && e.mean_ns > 0);

	test('every report row a tool lists is in the report, and every CLI label in a scenario', () => {
		const names = new Set(benchmarks_json.entries.map((e) => `${e.group.split('/')[0]}:${e.name}`));
		// a scenario's roster rather than its timed rows: a scenario published
		// aborted still names the tools it didn't time
		const cli_labels = new Set(benchmarks_cli.scenarios.flatMap((s) => s.labels));
		for (const tool of TOOL_SUPPORT) {
			for (const [operation, rows] of Object.entries(tool.rows)) {
				for (const name of rows) {
					assert.ok(names.has(`${operation}:${name}`), `${tool.name}: no ${operation} row ${name}`);
				}
			}
			for (const label of tool.cli_labels ?? []) {
				assert.ok(cli_labels.has(label), `${tool.name}: no CLI row ${label}`);
			}
		}
	});

	test('every timed report row belongs to a tool in the matrix', () => {
		// keyed on the operation too: tsv's `tsv` names a parse row and a format row
		const listed = new Set(
			TOOL_SUPPORT.flatMap((tool) =>
				Object.entries(tool.rows).flatMap(([operation, rows]) =>
					rows.map((name) => `${operation}:${name}`)
				)
			)
		);
		for (const entry of timed_entries) {
			const [operation] = entry.group.split('/');
			assert.ok(
				listed.has(`${operation}:${entry.name}`),
				`${entry.group}/${entry.name} is in no matrix row`
			);
		}
	});

	test('every CLI scenario facing another tool names the column it formats', () => {
		// an unmapped scenario would mark no cell, silently
		for (const scenario of benchmarks_cli.scenarios.filter((s) => !s.tsv_only)) {
			assert.ok(CLI_SCENARIO_LANGUAGES[scenario.key], `${scenario.key} maps to no column`);
		}
	});

	test('every CLI row facing another tool belongs to a tool in the matrix', () => {
		// tsv's own delivery rows (its dispatcher, its wasm build) mark tsv through its `tsv` row
		const listed = new Set(TOOL_SUPPORT.flatMap((tool) => tool.cli_labels ?? []));
		for (const scenario of benchmarks_cli.scenarios.filter((s) => !s.tsv_only)) {
			for (const { label } of scenario.results) {
				if (cli_label_is_tsv(label)) continue;
				assert.ok(listed.has(label), `${scenario.key}: ${label} is in no matrix row`);
			}
		}
	});

	test('every timed report row is a capability its tool states', () => {
		for (const tool of TOOL_SUPPORT) {
			for (const [operation, rows] of Object.entries(tool.rows) as Array<
				[ToolOperation, ReadonlyArray<string>]
			>) {
				const timed = timed_entries.filter(
					(e) => e.group.startsWith(`${operation}/`) && rows.includes(e.name)
				);
				for (const entry of timed) {
					const [, language] = entry.group.split('/');
					assert.include(TOOL_LANGUAGES, language, entry.group);
					assert.isDefined(
						tool.languages[language as ToolLanguage]?.[operation],
						`${tool.name} is timed on ${entry.group} but the matrix doesn't say it does that`
					);
				}
			}
		}
	});
});
