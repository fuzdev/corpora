<script lang="ts">
	import {
		baseline_ratio_color,
		compute_baseline_ratio,
		to_baseline_key,
		type BaselineRow
	} from './benchmark_baseline.ts';
	import { format_speedup } from './benchmark_display.ts';
	import BenchmarksBar from './BenchmarksBar.svelte';

	const {
		rows,
		label,
		default_anchor
	}: {
		// ordered so the first enabled row is the default baseline unless
		// `default_anchor` names another (callers lead with the canonical reference
		// for speed, the smallest build for size)
		rows: Array<BaselineRow>;
		// the key of the row to anchor on by default, when it isn't the first enabled one
		default_anchor?: string;
		// names the group to assistive tech, which reads the bars as a table
		label: string;
	} = $props();

	// the row currently acting as the baseline: the hovered row while the pointer is
	// over an enabled row, otherwise the group default (`default_anchor`, or its first enabled row). Each
	// group instance owns its own state, so the three groups in a section re-baseline
	// independently.
	let hovered_key: string | undefined = $state(undefined);
	const default_anchor_key = $derived(
		(rows.find((r) => !r.disabled && r.key === default_anchor) ?? rows.find((r) => !r.disabled))
			?.key
	);
	const anchor_key = $derived(hovered_key ?? default_anchor_key);
	const anchor_row = $derived(rows.find((r) => r.key === anchor_key));

	// Hover is handled here rather than per row: the anchor is the GROUP's state, so
	// the group is where the pointer belongs, and one delegated listener per group
	// replaces one per row (`to_baseline_key`). A disabled row publishes no key, so
	// it can never become the anchor.
</script>

<!-- A table to assistive tech, since the bar rows are a grid of spans rather than
	a `<table>` (the bars want a fluid track column the table layout would fight).
	`pointerleave` on the container restores the default anchor when the pointer
	leaves the group entirely. The rows carry no focus path: re-baselining is a
	non-essential pointer affordance over data that is fully visible regardless,
	with the default anchor serving keyboard and no-pointer readers. -->
<div
	class="bar-group"
	role="table"
	aria-label={label}
	onpointerover={(event) => (hovered_key = to_baseline_key(event))}
	onpointerleave={() => (hovered_key = undefined)}
>
	{#each rows as row (row.key)}
		{@const ratio =
			!row.disabled && anchor_row && row.key !== anchor_key
				? compute_baseline_ratio(row.raw, anchor_row.raw)
				: undefined}
		<BenchmarksBar
			label={row.label}
			bar_fraction={row.bar_fraction}
			category={row.category}
			value={row.value}
			annotation={row.annotation}
			disabled={row.disabled}
			placeholder={row.placeholder}
			ratio_text={format_speedup(ratio ?? 1)}
			ratio_color={ratio != null ? baseline_ratio_color(ratio) : 'var(--text_40)'}
			baseline_key={row.disabled ? undefined : row.key}
			anchor={row.key === anchor_key}
		/>
	{/each}
</div>

<style>
	/* the group is the grid and its rows are subgrids, so the columns size to the
	 * group's content — no widths to keep in step with the labels and values. The
	 * ratio column is the exception: its text changes on hover, so it is held at the
	 * widest ratio `format_speedup` prints (`−123.4x`) and re-baselining shifts nothing */
	.bar-group {
		container: benchmarks-bars / inline-size;
		display: grid;
		grid-template-columns:
			[label] max-content [track] minmax(0, 1fr) [value] max-content [annotation] max-content
			[ratio] 8ch;
		column-gap: var(--space_sm);
		/* a div carries no flow margin, so the note under a group would sit flush against it */
		margin-bottom: var(--space_md);
	}
</style>
