<script lang="ts">
	import type { Hue } from '@fuzdev/fuz_util/colors.ts';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	let {
		value = $bindable(180),
		children,
		...rest
	}: SvelteHTMLElements['div'] & {
		value?: Hue;
		children?: Snippet;
	} = $props();

	// TODO probably upstream this to fuz_util
	const parse_hue = (v: any): Hue | null => {
		const t = typeof v;
		if (t === 'number') return v;
		if (t !== 'string') return null;
		const parsed = Number(v);
		if (Number.isNaN(parsed)) return null;
		return parsed;
	};

	const update_hue = (v: Hue) => {
		value = v;
	};

	const on_input_event = (e: Event & { currentTarget: EventTarget & HTMLInputElement }) => {
		const parsed = parse_hue(e.currentTarget.value);
		if (parsed === null) return;
		update_hue(parsed);
	};

	let el: HTMLInputElement | undefined = $state.raw();

	const set_hue_from_minimap = (e: MouseEvent & { currentTarget: EventTarget & HTMLElement }) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const pct = (e.clientX - rect.x) / rect.width;
		update_hue(Math.floor(360 * pct));
		el?.focus();
	};
</script>

<!-- TODO consider making this a text input or otherwise editable directly -->
<div {...rest} class="hue-input {rest.class}" style:--hue={value}>
	<label class="unstyled">
		{#if children}<div class="title">{@render children()}</div>{/if}
		<div class="preview">
			hue:
			<input type="number" step="0" class="hue" {value} oninput={on_input_event} />
		</div>
	</label>
	<div class="minimap-wrapper">
		<div class="minimap" onclick={set_hue_from_minimap} aria-hidden="true"></div>
	</div>
	<input
		bind:this={el}
		type="range"
		aria-label="hue"
		{value}
		oninput={on_input_event}
		min="0"
		max="359"
	/>
</div>

<style>
	.hue-input {
		--outline_color: oklch(0.65 0.13 var(--hue));
		/* TODO @many figure these variables out so they're easily customized (similar pattern in a lot of places) */
		/* --thumb_background_color: oklch(0.6 0.13 var(--hue)); */
	}
	.preview {
		background-color: oklch(0.6 0.13 var(--hue));
		/* mirror the `min-height: var(--input_height)` that fuz_css gives the sibling inputs,
		so the preview tracks their height even when `--input_height` is customized */
		min-height: var(--input_height);
		margin: 0;
		display: flex;
		flex-direction: row;
		align-items: center;
		font-weight: 700;
		color: var(--shade_00);
		padding-left: var(--space_xl2);
		border-top-left-radius: var(--border_radius, var(--border_radius_md));
		border-top-right-radius: var(--border_radius, var(--border_radius_md));
	}
	.minimap-wrapper {
		padding: 0 var(--input_padding_x);
	}
	.minimap {
		/* sweep the OKLCH hue circle at constant lightness/chroma so the strip
			matches what the hue knobs actually produce */
		background: linear-gradient(
			90deg in oklch longer hue,
			oklch(0.6 0.13 0) 0%,
			oklch(0.6 0.13 360) 100%
		);
		height: var(--space_lg);
	}
	/* TODO generic way to make this seamless? */
	input {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.hue {
		width: 10rem;
		min-width: 10rem;
		margin-left: var(--space_lg);
		font-size: var(--font_size_md);
		text-align: center;
		background-color: transparent;
		border: none;
		border-radius: var(--border_radius, var(--border_radius_md));
		color: var(--shade_00);
	}
</style>
