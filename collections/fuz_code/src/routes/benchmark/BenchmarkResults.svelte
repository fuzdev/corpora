<script lang="ts">
	import { scale } from 'svelte/transition';
	import CopyToClipboard from '@fuzdev/fuz_ui/CopyToClipboard.svelte';

	import { fmt } from './benchmark_stats.ts';
	import { RESULT_COLUMNS, results_to_markdown } from './benchmark_results.ts';
	import type { BenchmarkResult, SummaryStats } from './benchmark_types.ts';
	import type { ImplementationName } from './benchmark_fixtures.ts';

	const {
		results = [],
		summary = null,
		warnings = []
	}: {
		results: Array<BenchmarkResult>;
		summary: Record<ImplementationName, SummaryStats> | null;
		warnings: Array<string>;
	} = $props();
</script>

{#if warnings.length > 0}
	<section class="panel p_md warning">
		<h3 class="mt_0">⚠️ Warnings</h3>
		<ul>
			{#each warnings as warning (warning)}
				<li>{warning}</li>
			{/each}
		</ul>
	</section>
{/if}

{#if summary}
	<section>
		<h2>Summary</h2>
		<div>
			{#each Object.entries(summary) as entry (entry)}
				{@const [impl, stats] = entry}
				<div>
					<h3>{impl}</h3>
					<div>
						<strong>{fmt(stats.avg_mean)}ms</strong>
						<span>avg time</span>
					</div>
					<div>
						<strong>{fmt(stats.avg_ops, 0)}</strong>
						<span>ops/sec</span>
					</div>
					<div>
						<strong>{fmt(stats.avg_cv * 100, 1)}%</strong>
						<span>CV</span>
					</div>
					{#if impl !== 'html' && stats.improvement !== undefined}
						<div>
							<strong class:positive={stats.improvement > 0} class:negative={stats.improvement < 0}>
								{stats.improvement > 0 ? '+' : ''}{fmt(stats.improvement, 1)}%
							</strong>
							<span>vs baseline</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}

{#if results.length > 0}
	<section>
		<h2>Results</h2>
		<table>
			<thead>
				<tr>
					{#each RESULT_COLUMNS as column (column)}
						<th>{column.header}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each results as result (result)}
					<tr>
						{#each RESULT_COLUMNS as column (column)}
							<td class={column.get_class?.(result) || ''}>
								{column.get_value(result)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="mt_md">
			<CopyToClipboard text={results_to_markdown(results)}>
				{#snippet children(copied, failed)}
					{#if copied}
						<span in:scale={{ duration: 200 }}>copied ✓</span>
					{:else if failed}
						<span>copy failed</span>
					{:else}
						copy results as markdown
					{/if}
				{/snippet}
			</CopyToClipboard>
		</div>

		<div>
			<h3>Legend</h3>
			<ul>
				<li>
					<strong>Mean / Median / percentiles</strong>: work time — stylize + DOM commit + layout,
					the highlighter's compute cost
				</li>
				<li>
					<strong>Paint</strong>: mean time until pixels settle (work plus ~1–2 animation frames)
				</li>
				<li>
					<strong>CV</strong>: Coefficient of Variation (std_dev/mean) - lower is better, &lt;15% is
					good
				</li>
				<li>
					<strong>P75/P90/P95/P99</strong>: Percentiles - X% of measurements were faster than this
				</li>
				<li><strong>Ops/sec</strong>: Operations per second (throughput)</li>
				<li><strong>Stability</strong>: Percentage of iterations with stable system metrics</li>
			</ul>
		</div>
	</section>
{/if}
