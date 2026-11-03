<script lang="ts">
	import { plural } from '@fuzdev/fuz_util/string.ts';

	import { to_baseline_key } from './benchmark_baseline.ts';
	import {
		format_cli_corpus,
		format_count,
		format_mib,
		format_ms,
		format_speedup
	} from './benchmark_display.ts';
	import {
		cli_default_anchor_label,
		cli_ratio_between,
		type BenchmarksCliReport,
		type CliScenario,
		type CliFormatterResult,
		type CliMetric
	} from './benchmarks_cli.ts';

	const {
		report
	}: {
		report: BenchmarksCliReport;
	} = $props();

	// the row the pointer is over re-baselines its own table, as the format, parse,
	// and size groups do (`to_baseline_key`); only one row is ever hovered, so one
	// slot serves every table
	let hovered: { scenario_key: string; label: string } | undefined = $state(undefined);
	const to_hovered = (event: PointerEvent, scenario_key: string): typeof hovered => {
		const label = to_baseline_key(event);
		return label === undefined ? undefined : { scenario_key, label };
	};

	// Every ratio is `anchor / row` (>1 = the row is that many times faster or lighter
	// than the anchor; `format_speedup` prints a worse row negated, as the charts do),
	// through the same `cli_ratio_between` the page's prose quotes. The anchor is
	// the hovered row, else the scenario's default (`cli_default_anchor_label`: the
	// dispatcher row facing other tools, native tsv in the tsv-only table).
	// `undefined` on the anchor row itself and wherever a side wasn't measured. A
	// scenario with no tsv row has nothing to anchor on and renders no table.
	interface Row {
		result: CliFormatterResult;
		is_anchor: boolean;
		wall_ratio: number | undefined;
		cpu_ratio: number | undefined;
		memory_ratio: number | undefined;
	}
	const to_anchor_label = (scenario: CliScenario): string | undefined =>
		hovered?.scenario_key === scenario.key ? hovered.label : cli_default_anchor_label(scenario);
	const to_rows = (scenario: CliScenario, anchor_label: string | undefined): Array<Row> => {
		if (anchor_label === undefined) return [];
		return scenario.results.map((result) => {
			const is_anchor = result.label === anchor_label;
			const ratio = (metric: CliMetric) =>
				is_anchor
					? undefined
					: cli_ratio_between(scenario.results, anchor_label, result.label, metric);
			return {
				result,
				is_anchor,
				wall_ratio: ratio('wall_ms'),
				cpu_ratio: ratio('cpu_ms'),
				memory_ratio: ratio('memory_mb')
			};
		});
	};
	// the anchor's own cells read as the unit they are; an unmeasured side stays a dash
	const format_cell = (row: Row, ratio: number | undefined, measured: boolean): string =>
		ratio != null ? format_speedup(ratio) : row.is_anchor && measured ? format_speedup(1) : '—';
</script>

{#each report.scenarios as scenario (scenario.key)}
	{@const anchor_label = to_anchor_label(scenario)}
	{@const rows = to_rows(scenario, anchor_label)}
	<div class="mb_xl5">
		<h3>{scenario.heading}: {scenario.target}</h3>
		<p>{scenario.description}</p>
		{#if rows.length > 0}
			<div class="benchmarks-table-scroll">
				<table class="benchmarks-table">
					<thead>
						<tr>
							<th scope="col" class="formatter">formatter</th>
							<th scope="col">time</th>
							<th scope="col">time ratio</th>
							<th scope="col">CPU ratio</th>
							<th scope="col">peak RSS</th>
							<th scope="col">RSS ratio</th>
						</tr>
					</thead>
					<!-- hover re-baselines this table's ratios only, and `pointerleave` restores the
						default anchor; no focus path, as `BenchmarksBaselineGroup` -->
					<tbody
						onpointerover={(event) => (hovered = to_hovered(event, scenario.key))}
						onpointerleave={() => (hovered = undefined)}
					>
						{#each rows as row (row.result.label)}
							<tr class:anchor={row.is_anchor} data-baseline-key={row.result.label}>
								<th scope="row" class="formatter">{row.result.label}</th>
								<td>{format_ms(row.result.wall_ms)}</td>
								<td class="speedup">
									{format_cell(row, row.wall_ratio, true)}
								</td>
								<td class="speedup">
									{format_cell(row, row.cpu_ratio, true)}
								</td>
								<td>{format_mib(row.result.memory_mb)}</td>
								<td class="speedup">
									{format_cell(row, row.memory_ratio, row.result.memory_mb != null)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<!-- one note per table: the corpus revision and size, and the run counts; the section's
			notes say how memory is measured -->
		<p>
			<small>
				Corpus:
				{format_cli_corpus(scenario.corpus)}{scenario.files
					? `, ${format_count(scenario.files)} file${plural(scenario.files)}`
					: ''}.
				{#if rows.length > 0 && scenario.benchmark_runs > 0}
					Each time is the mean of {scenario.benchmark_runs} runs after {scenario.warmup_runs}
					warmups.
				{/if}
			</small>
		</p>
		{#if scenario.unshimmed}
			<p><small>{scenario.unshimmed}</small></p>
		{/if}
		{#if scenario.aborted}
			<p>{scenario.aborted}</p>
		{/if}
	</div>
{/each}

<style>
	/* fixed columns, so re-baselining on hover changes the ratios' text and nothing
	   else; the floor keeps a narrow screen scrolling rather than squeezing */
	table {
		table-layout: fixed;
		min-width: 64rem;
	}
	th,
	td {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.formatter {
		width: 30%;
		text-align: left;
	}
	.speedup {
		font-weight: 600;
	}
	/* the row every ratio in the table is currently taken against — the default, or
	   whichever row is hovered — marked as the bar groups mark theirs; a row's
	   background means nothing else here, so the base `tr:hover` tint is matched to it */
	tr.anchor,
	tbody tr:hover {
		background-color: var(--ink_05);
	}
	tr.anchor .formatter {
		box-shadow: inset var(--border_width_3) 0 0 var(--ink_50);
	}
	tr.anchor .speedup {
		color: var(--text_40);
	}
</style>
