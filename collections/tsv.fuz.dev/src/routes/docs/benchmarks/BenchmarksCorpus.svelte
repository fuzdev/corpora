<script lang="ts">
	import type { CorpusSourceTable } from './benchmark_data.ts';
	import { format_count, format_language } from './benchmark_display.ts';

	const {
		table
	}: {
		table: CorpusSourceTable;
	} = $props();
</script>

{#snippet count_cell(count: number | undefined)}
	<td class="benchmarks-num" class:text_40={!count}>
		{count === undefined ? '—' : format_count(count)}
	</td>
{/snippet}

<div class="benchmarks-table-scroll">
	<table class="benchmarks-table">
		<thead>
			<tr>
				<th scope="col">source</th>
				<th scope="col">commit</th>
				<th scope="col" class="benchmarks-num">files</th>
				{#each table.languages as language (language)}
					<th scope="col" class="benchmarks-num">{format_language(language)}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			<!-- the report's own totals lead as the sum the source rows break down -->
			<tr>
				<th scope="row">all sources</th>
				<td></td>
				{@render count_cell(table.totals.files)}
				{#each table.totals.by_language as count, i (table.languages[i])}
					{@render count_cell(count)}
				{/each}
			</tr>
			{#each table.rows as row (row.path)}
				<tr>
					<th scope="row">
						{#if row.url}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={row.url} rel="external">{row.label}</a>
						{:else}
							{row.label}
						{/if}
						{#if row.subpath}<small class="text_40">{row.subpath}</small>{/if}
					</th>
					<td class="text_40">
						{#if row.commit}<code>{row.commit}</code>{/if}
					</td>
					{@render count_cell(row.files)}
					{#each row.by_language as count, i (table.languages[i])}
						{@render count_cell(count)}
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
