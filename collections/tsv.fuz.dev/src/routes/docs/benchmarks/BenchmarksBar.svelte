<script lang="ts">
	import type { ImplementationCategory } from './benchmark_data.ts';
	import { category_color, format_row_label, type FormattedUnit } from './benchmark_display.ts';

	const {
		label,
		bar_fraction,
		category,
		value,
		ratio_text,
		ratio_color,
		annotation,
		disabled = false,
		placeholder = 'no API',
		baseline_key,
		anchor = false
	}: {
		label: string;
		bar_fraction: number;
		category: ImplementationCategory;
		value: FormattedUnit;
		ratio_text: string;
		ratio_color: string | undefined;
		// optional extra context shown between value and ratio (gzipped size in the
		// binary-size groups); omitted when absent
		annotation?: string | undefined;
		// a grayed-out, inert placeholder (a tool that doesn't run in this group) —
		// no bar, no value, no ratio, just the label held in its shared slot
		disabled?: boolean;
		// what a `disabled` row reads in its value cell: why the tool is absent
		// (a parse slot's tool has no parser API; the size table's slot, no wasm
		// build) or, on a coverage-only row, why it ran but went untimed
		placeholder?: string;
		// hover-to-rebaseline: the key the group's delegated `pointerover` reads off
		// this row to adopt it as the ratio anchor. Omitted on inert placeholders,
		// which publish no key and so can never become the anchor.
		baseline_key?: string | undefined;
		// the row every ratio in the group is currently taken against
		anchor?: boolean;
	} = $props();

	const display_label = $derived(format_row_label(label, disabled));
</script>

<!-- the grid is a table to assistive tech (its parent is the `role="table"`):
	each row is one tool, its cells the label, measurement, annotation, and ratio;
	the bar itself only repeats the measurement visually, so it is hidden. Hover is
	handled by the group, which reads `data-baseline-key` off whichever row the
	pointer is over — see `BenchmarksBaselineGroup` -->
<div class="bar-row" class:disabled class:anchor role="row" data-baseline-key={baseline_key}>
	<span class="bar-label" role="rowheader">{display_label}</span>
	<div class="bar-track" role="cell" aria-hidden="true">
		{#if !disabled}
			<div
				class="bar-fill"
				style:width="{bar_fraction * 100}%"
				style:background={category_color(category)}
			></div>
		{/if}
	</div>
	<span class="bar-value" role="cell">
		{#if disabled}
			{placeholder}
		{:else}
			{value.value} {value.unit}
		{/if}
	</span>
	{#if annotation != null}
		<small class="bar-annotation" role="cell">{annotation}</small>
	{/if}
	<span class="bar-ratio" role="cell" style:color={ratio_color}>
		{#if !disabled}{ratio_text}{/if}
	</span>
</div>

<style>
	/* a row borrows its columns from the group's grid (`BenchmarksBaselineGroup`), so
	 * every row's cells line up and size to the group's content */
	.bar-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
		/* rows sit flush (no inter-row gap) with a little padding, so the anchor
		 * highlight reads as one contiguous, full-height band per row */
		padding: var(--space_xs);
	}
	.bar-row.disabled {
		opacity: 0.6;
	}
	/* the row every ratio in the group is currently taken against — the default, or
	 * whichever enabled row is hovered (driven in JS) — marked as the CLI tables mark
	 * theirs */
	.bar-row.anchor {
		background-color: var(--ink_05);
		box-shadow: inset var(--border_width_3) 0 0 var(--ink_50);
	}
	.bar-label,
	.bar-value,
	.bar-annotation,
	.bar-ratio {
		text-align: right;
		white-space: nowrap;
	}
	.bar-label {
		grid-column: label;
	}
	.bar-track {
		grid-column: track;
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		background: var(--ink_05);
	}
	.bar-fill {
		height: 100%;
		border-radius: var(--border_radius_xs);
		min-width: 2px;
		transition: width 0.3s ease;
	}
	.bar-value {
		grid-column: value;
	}
	.bar-annotation {
		grid-column: annotation;
	}
	.bar-ratio {
		grid-column: ratio;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	/* too narrow for a bar beside its label: the label takes a line of its own */
	@container benchmarks-bars (max-width: 36rem) {
		.bar-label {
			grid-column: 1 / -1;
			/* clear of the anchor's edge, which the right-aligned label never met */
			padding-left: var(--space_xs);
			text-align: left;
		}
	}
</style>
