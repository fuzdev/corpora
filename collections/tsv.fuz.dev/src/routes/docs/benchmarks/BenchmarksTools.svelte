<script lang="ts">
	import {
		derive_tool_footnotes,
		TOOL_FOOTNOTES,
		TOOL_LANGUAGE_LABELS,
		TOOL_LANGUAGES,
		type ToolCell,
		type ToolMatrixRow
	} from './benchmark_tools.ts';

	const {
		rows
	}: {
		rows: Array<ToolMatrixRow>;
	} = $props();

	// numbered in the order the table first uses them
	const footnotes = $derived(derive_tool_footnotes(rows));

	// read in place of the visible mark, which leans on weight, color, and a superscript
	const to_label = (cell: ToolCell): string =>
		(cell.operation === 'parse' ? 'parses' : 'formats') +
		(cell.footnote ? `, ${TOOL_FOOTNOTES[cell.footnote]}` : '') +
		(cell.timed ? ', timed' : ', not timed');
</script>

<div class="benchmarks-table-scroll">
	<table class="benchmarks-table">
		<thead>
			<tr>
				<th scope="col">tool</th>
				{#each TOOL_LANGUAGES as language (language)}
					<th scope="col">{TOOL_LANGUAGE_LABELS[language]}</th>
				{/each}
				<th scope="col">other</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.name)}
				<tr>
					<th scope="row">
						{#if row.url}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={row.url} rel="external">{row.name}</a>
						{:else}
							{row.name}
						{/if}
					</th>
					{#each TOOL_LANGUAGES as language (language)}
						{@const cells = row.cells[language]}
						<td class="support">
							{#each cells as cell, i (cell.operation)}
								<span class="op" class:timed={cell.timed}>
									<span aria-hidden="true">
										{cell.operation === 'parse' ? 'P' : 'F'}{#if cell.footnote}
											<sup>{footnotes.indexOf(cell.footnote) + 1}</sup>
										{/if}
									</span><span class="sr-only">{i > 0 ? '; ' : ''}{to_label(cell)}</span>
								</span>
							{:else}
								<span class="text_40" aria-hidden="true">—</span><span class="sr-only">none</span>
							{/each}
						</td>
					{/each}
					<td class="other">{row.other ?? ''}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p>
	<small>
		{#each footnotes as footnote, i (footnote)}
			<sup>{i + 1}</sup>&nbsp;{TOOL_FOOTNOTES[footnote]}{i < footnotes.length - 1 ? '; ' : '.'}
		{/each}
	</small>
</p>

<style>
	tbody th {
		white-space: nowrap;
	}
	.support {
		white-space: nowrap;
		/* contains the `.sr-only` text, which would otherwise escape the table's scroll
		   container and widen the page */
		position: relative;
	}
	.op + .op {
		margin-left: 0.5ch;
	}
	.op:not(.timed) {
		color: var(--text_40);
	}
	.op.timed {
		font-weight: 700;
	}
	/* visually hidden, still read aloud */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.other {
		color: var(--text_50);
		font-size: var(--font_size_sm);
	}
</style>
