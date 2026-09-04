<script lang="ts">
	import { format_speedup } from './benchmark_data.ts';
	import type { BenchmarksCliReport, CliScenario, CliFormatterResult } from './benchmarks_cli.ts';

	const {
		report
	}: {
		report: BenchmarksCliReport;
	} = $props();

	// listed as the harness reported them, so a formatter added or dropped upstream
	// shows up here instead of silently rendering `undefined` for a fixed key
	const versions = $derived(
		Object.entries(report.versions)
			.map(([name, version]) => `${name} ${version}`)
			.join(', ')
	);

	const format_time = (ms: number): string =>
		ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

	// tsv is the reference row; every ratio is `other / tsv` (>1 = tsv is that many
	// times faster / lighter). Returns null for the tsv row itself.
	interface Row {
		result: CliFormatterResult;
		is_tsv: boolean;
		wall_ratio: number | null;
		cpu_ratio: number | null;
		memory_ratio: number | null;
	}
	const to_rows = (scenario: CliScenario): Array<Row> => {
		const tsv = scenario.results.find((r) => r.label === 'tsv');
		if (!tsv) return [];
		return scenario.results.map((result) => {
			const is_tsv = result === tsv;
			return {
				result,
				is_tsv,
				wall_ratio: is_tsv ? null : result.wall_ms / tsv.wall_ms,
				cpu_ratio: is_tsv ? null : result.cpu_ms / tsv.cpu_ms,
				memory_ratio:
					is_tsv || result.memory_mb == null || tsv.memory_mb == null
						? null
						: result.memory_mb / tsv.memory_mb
			};
		});
	};
</script>

{#each report.scenarios as scenario (scenario.key)}
	<div class="scenario">
		<h3>{scenario.heading}: {scenario.target}</h3>
		<p>{scenario.description}</p>
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th class="formatter">formatter</th>
						<th>time</th>
						<th>vs tsv</th>
						<th>vs tsv (CPU work)</th>
						<th>peak RSS</th>
						<th>vs tsv</th>
					</tr>
				</thead>
				<tbody>
					{#each to_rows(scenario) as row (row.result.label)}
						<tr class:tsv={row.is_tsv}>
							<td class="formatter">{row.result.label}</td>
							<td>{format_time(row.result.wall_ms)}</td>
							<td class="speedup">
								{row.wall_ratio == null ? '—' : format_speedup(row.wall_ratio)}
							</td>
							<td class="speedup">{row.cpu_ratio == null ? '—' : format_speedup(row.cpu_ratio)}</td>
							<td>
								{row.result.memory_mb == null ? '—' : `${Math.round(row.result.memory_mb)} MB`}
							</td>
							<td class="speedup">
								{row.memory_ratio == null ? '—' : format_speedup(row.memory_ratio)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/each}

<p class="versions">
	Measured on {report.machine} — {versions}. Wall-clock ratios scale with core count; "vs tsv (CPU
	work)" is the parallelism-neutral view.
</p>

<style>
	.scenario {
		margin-bottom: var(--space_xl2);
	}
	/* wide table scrolls in its own container so the page body never scrolls sideways */
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
	}
	th,
	td {
		padding: var(--space_xs) var(--space_sm);
		text-align: right;
		white-space: nowrap;
	}
	.formatter {
		text-align: left;
	}
	.speedup {
		font-weight: 600;
	}
	tr.tsv {
		font-weight: 700;
		background-color: var(--fg_10);
	}
	.versions {
		font-size: var(--font_size_sm);
		opacity: 0.7;
	}
</style>
