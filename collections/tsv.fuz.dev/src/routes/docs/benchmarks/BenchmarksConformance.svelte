<!--
	TODO: show per-corpus-source coverage, not just the per-language aggregate.

	Each group's aggregate blends corpora that answer different questions, so the
	single percentage below is a summary rather than the finding. `parse/typescript`
	is mostly test262 — ECMAScript, not TypeScript — so a real TS gap moves the
	number by tenths of a point and reads as noise. And on the corpus a tool's own
	parser selected, that tool scores 100% BY CONSTRUCTION rather than by
	achievement (tsc on the tsc corpus, svelte/compiler on the Svelte set), which
	the aggregate presents as if it were a result.

	The data is already here: the report carries `coverage_by_source`
	(`group → source → impl → {processed, total}`) from `version` 8 on — the
	machine-readable half of the per-source tables in tsv's own markdown report,
	which splits exactly this way and for exactly this reason. It needs a
	`derive_*` in `benchmark_data.ts` plus a nested table or a per-source
	breakdown under each group.
-->
<script lang="ts">
	import { format_coverage_percent, type ConformanceGroup } from './benchmark_data.ts';

	const {
		groups
	}: {
		groups: Array<ConformanceGroup>;
	} = $props();

	const LANGUAGE_LABELS: Record<string, string> = {
		svelte: 'Svelte',
		typescript: 'TypeScript',
		css: 'CSS'
	};
</script>

{#each groups as group (group.language)}
	<div class="mb_xl5">
		<p class="heading">
			Parsing {group.files_total.toLocaleString('en-US')}
			{LANGUAGE_LABELS[group.language] ?? group.language} files
		</p>
		<table>
			<thead>
				<tr>
					<th></th>
					<th class="num">files accepted</th>
					<th class="num">coverage</th>
				</tr>
			</thead>
			<tbody>
				{#each group.rows as row (row.name)}
					<tr>
						<td>
							{row.name}{#if row.note}
								<span class="note">({row.note})</span>
							{/if}
						</td>
						<td class="num">
							{row.files_processed.toLocaleString('en-US')} / {row.files_total.toLocaleString(
								'en-US'
							)}
						</td>
						<td class="num percent">{format_coverage_percent(row.coverage_fraction)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/each}

<style>
	.heading {
		margin-bottom: var(--space_xs);
	}
	table {
		width: 100%;
		max-width: 40rem;
		border-collapse: collapse;
	}
	th {
		font-weight: 400;
		font-size: var(--font_size_sm);
		color: var(--text_40);
		text-align: left;
		padding-block: var(--space_xs);
	}
	td {
		padding-block: var(--space_xs);
		border-top: var(--border_width) solid var(--border_color);
	}
	.note {
		font-size: var(--font_size_sm);
		color: var(--text_40);
	}
	.num {
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.percent {
		font-weight: 700;
	}
</style>
