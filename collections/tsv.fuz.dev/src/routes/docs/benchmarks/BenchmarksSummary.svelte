<script lang="ts">
	import { format_speedup, type SpeedupRow } from './benchmark_data.ts';

	const {
		rows
	}: {
		rows: Array<SpeedupRow>;
	} = $props();
</script>

<p>
	tsv's formatter is inspired by and borrows architectural patterns from <a
		href="https://prettier.io/"
	>
		Prettier
	</a>, and we're grateful for the hard work of its
	<a href="https://github.com/prettier/prettier/graphs/contributors">contributors</a>.
	Single-threaded on the benchmarked corpus, tsv is this much faster than Prettier:
</p>
<table>
	<thead>
		<tr>
			<th></th>
			<th class="color_h_50">Svelte</th>
			<th class="color_i_50">TypeScript</th>
			<th class="color_a_50">CSS</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.variant)}
			{@const cells = [row.format_svelte, row.format_typescript, row.format_css]}
			<tr>
				<td class="variant">{row.variant}</td>
				{#each cells as value, i (i)}
					<td class="speedup">{value != null ? format_speedup(value) : '-'}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	table {
		width: 100%;
	}
	thead th {
		padding: var(--space_xs) var(--space_sm);
	}
	tbody td {
		padding: var(--space_xs) var(--space_sm);
	}
	.variant {
		text-align: left;
		font-weight: 600;
	}
	.speedup {
		font-size: var(--font_size_xl);
		font-weight: 700;
	}
</style>
