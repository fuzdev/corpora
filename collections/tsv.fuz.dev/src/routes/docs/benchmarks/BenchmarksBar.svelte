<script lang="ts">
	import {
		category_color,
		format_label,
		type FormattedUnit,
		type ImplementationCategory
	} from './benchmark_data.ts';

	const {
		label,
		bar_fraction,
		category,
		value,
		ratio_text,
		ratio_color,
		annotation,
		disabled = false,
		coverage_only = false,
		on_enter,
		on_leave
	}: {
		label: string;
		bar_fraction: number;
		category: ImplementationCategory;
		value: FormattedUnit;
		ratio_text: string;
		ratio_color: string | undefined;
		// optional extra context shown between value and ratio (corpus coverage in
		// benchmark groups, gzipped size in binary-size groups); omitted when absent
		annotation?: string | undefined;
		// a grayed-out, inert placeholder (a tool that doesn't run in this group) —
		// no bar, no value, no ratio, just the label held in its shared slot
		disabled?: boolean;
		// inert for a different reason: the tool DID run over the whole corpus but
		// was deliberately never timed (no in-process API, so a per-file row would
		// have measured process spawn). Reads `not timed` rather than `n/a`, since
		// "we chose not to measure this" and "this tool wasn't here" are different
		// claims and the gray alone can't tell them apart
		coverage_only?: boolean;
		// hover-to-rebaseline: fired when the pointer enters/leaves the row so the
		// group can adopt this row as its ratio anchor; omitted on inert placeholders
		on_enter?: (() => void) | undefined;
		on_leave?: (() => void) | undefined;
	} = $props();

	// the parenthesized binding suffix (`(wasm)`/`(node napi)`) describes how the
	// tool actually ran in this (Node) report - meaningless for the disabled
	// placeholders of single-variant tools (biome and dprint each ship only a wasm
	// build here, so there's no ambiguity to lose). oxc-parser keeps its suffix even
	// when disabled since it has two placeholder rows (napi and wasm) that would
	// otherwise become indistinguishable.
	const display_label = $derived(
		disabled && (category === 'biome' || category === 'dprint')
			? format_label(label).replace(/ \([^)]*\)$/, '')
			: format_label(label)
	);
</script>

<!-- the hover handlers only re-baseline the group's ratios — a non-essential
	visual aid over data that's fully visible regardless, with the default anchor
	serving keyboard and no-hover users — so the row stays presentational -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="bar-row"
	class:has-annotation={annotation != null}
	class:disabled
	onmouseenter={on_enter}
	onmouseleave={on_leave}
>
	<span class="bar-label">{display_label}</span>
	<div class="bar-track">
		{#if !disabled}
			<div
				class="bar-fill"
				style:width="{bar_fraction * 100}%"
				style:background={category_color(category)}
			></div>
		{/if}
	</div>
	<span class="bar-value">
		{#if disabled}
			<span class="text_40">{coverage_only ? 'not timed' : 'n/a'}</span>
		{:else}
			{value.value} <span class="text_50">{value.unit}</span>
		{/if}
	</span>
	{#if annotation != null}
		<span class="bar-annotation text_50">{annotation}</span>
	{/if}
	<span class="bar-ratio" style:color={ratio_color}>
		{#if !disabled}{ratio_text}{/if}
	</span>
</div>

<style>
	.bar-row {
		display: grid;
		grid-template-columns: 16rem 1fr 5.6rem 3.4rem;
		align-items: center;
		gap: var(--space_sm);
		/* rows sit flush (no inter-row gap) with a little padding, so the hover
		 * highlight reads as one contiguous, full-height band per row */
		padding-block: var(--space_xs);
		border-radius: var(--border_radius_xs);
	}
	.bar-row.has-annotation {
		grid-template-columns: 16rem 1fr 5.6rem 6rem 3.4rem;
	}
	.bar-row.disabled {
		opacity: 0.6;
	}
	/* hovering an enabled row makes it the group's ratio anchor (driven in JS); the
	 * highlight marks which row every ratio in the group is now measured against */
	.bar-row:not(.disabled):hover {
		background-color: var(--fg_10);
	}
	.bar-annotation {
		font-size: var(--font_size_xs);
		text-align: right;
		white-space: nowrap;
	}
	.bar-label {
		font-size: var(--font_size_sm);
		text-align: right;
		white-space: nowrap;
		/* these may overflow slightly/harmlessly, just need to visually check */
	}
	.bar-track {
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		background: var(--fg_05);
	}
	.bar-fill {
		height: 100%;
		border-radius: var(--border_radius_xs);
		min-width: 2px;
		transition: width 0.3s ease;
	}
	.bar-value {
		font-size: var(--font_size_sm);
		text-align: right;
		white-space: nowrap;
	}
	.bar-ratio {
		font-size: var(--font_size_sm);
		font-weight: 700;
		text-align: right;
	}
</style>
