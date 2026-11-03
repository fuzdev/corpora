<script lang="ts">
	import type { ConformanceCell, ConformanceMatrix } from './conformance_data.ts';
	import {
		format_count,
		format_coverage_percent,
		format_language
	} from '../benchmarks/benchmark_display.ts';

	const {
		matrices
	}: {
		matrices: Array<ConformanceMatrix>;
	} = $props();
</script>

<!-- a percentage this close to 100% compresses the gap, so the rejected count rides
	beside it; a cell whose engine selected the source is full by construction, so it
	reads a dimmed `100%` without the decimals a result carries -->
{#snippet coverage_cell(cell: ConformanceCell | undefined)}
	<td class="coverage-num">
		{#if !cell}
			—
		{:else if cell.selected}
			<span class="text_40">100%<span class="visually-hidden">{' '}by construction</span></span>
		{:else}
			{format_coverage_percent(cell.coverage_fraction)}
			{#if cell.rejected > 0}
				<small class="text_40">−{format_count(cell.rejected)}</small>
			{/if}
		{/if}
	</td>
{/snippet}

{#each matrices as matrix (matrix.language)}
	<div class="mb_xl5">
		<h3>
			Parsing {format_count(matrix.files_total)}
			{format_language(matrix.language)} files
		</h3>
		<div class="benchmarks-table-scroll">
			<table class="benchmarks-table">
				<thead>
					<tr>
						<th scope="col">source</th>
						<th scope="col">files</th>
						{#each matrix.engines as engine (engine.name)}
							<th scope="col" class="coverage-num">
								{engine.name}
								{#if engine.note}<small>({engine.note})</small>{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					<!-- every engine over the same files, leaving out a source an engine selected:
						its 100% there is construction, which would rank it on files the others had
						no say in -->
					{#if matrix.aggregate}
						<tr>
							<th scope="row">
								{#if matrix.aggregate.excluded.length}
									all sources but
									{matrix.aggregate.excluded.map((o) => o.label ?? o.path).join(', ')}
								{:else}
									all sources
								{/if}
							</th>
							<td class="coverage-num">{format_count(matrix.aggregate.files)}</td>
							{#each matrix.aggregate.cells as cell, i (matrix.engines[i]?.name)}
								{@render coverage_cell(cell)}
							{/each}
						</tr>
					{/if}
					{#each matrix.sources as source (source.origin.path)}
						<tr>
							<th scope="row">
								{#if source.origin.url}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href={source.origin.url} rel="external">
										{#if source.origin.label}
											{source.origin.label}
										{:else}
											<code>{source.origin.path}</code>
										{/if}
									</a>
								{:else if source.origin.label}
									{source.origin.label}
								{:else}
									<code>{source.origin.path}</code>
								{/if}
							</th>
							<td class="coverage-num">{format_count(source.files)}</td>
							{#each source.cells as cell, i (matrix.engines[i]?.name)}
								{@render coverage_cell(cell)}
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/each}

<style>
	/* left-aligned like the source names they sit among, where `.benchmarks-num`
	   aligns pure numbers right */
	.coverage-num {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	/* read out, not shown: the dimmed `100%` says it by sight alone */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
