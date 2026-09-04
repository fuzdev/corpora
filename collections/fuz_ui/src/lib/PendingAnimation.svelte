<script lang="ts">
	import type { OmitStrict } from '@fuzdev/fuz_util/types.ts';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	const {
		inline,
		running = true,
		item_attrs,
		children,
		...rest
	}: OmitStrict<SvelteHTMLElements['span'], 'children'> & {
		inline?: boolean;
		running?: boolean;
		item_attrs?: SvelteHTMLElements['span'];
		children?: Snippet<[index: number]>;
	} = $props();

	// TODO maybe switch to an `inline` class instead of setting multiple classes
</script>

<span
	{...rest}
	class={[
		'pending-animation',
		rest.class,
		inline ? 'display:inline-flex align-items:center' : 'display:flex',
		{ running }
	]}
>
	<span {...item_attrs} style:animation-delay="0s">
		{#if children}{@render children(0)}{:else}•{/if}
	</span><span {...item_attrs} style:animation-delay="0.09s">
		{#if children}{@render children(1)}{:else}•{/if}
	</span><span {...item_attrs} style:animation-delay="0.3s">
		{#if children}{@render children(2)}{:else}•{/if}
	</span>
</span>

<style>
	.pending-animation span {
		font-size: var(--font_size, inherit);
		display: inline-block;
		transform: scale3d(var(--scale_x, 0.4), var(--scale_y, 0.4), var(--scale_z, 0.4));
		animation: dot var(--animation_duration, var(--duration_5, 1.5s)) infinite paused;
	}

	.running span {
		animation-play-state: running;
	}

	@keyframes dot {
		0% {
			transform: scale3d(var(--scale_x, 0.4), var(--scale_y, 0.4), var(--scale_z, 0.4));
		}
		71% {
			transform: scale3d(1, 1, 1);
		}
		100% {
			transform: scale3d(var(--scale_x, 0.4), var(--scale_y, 0.4), var(--scale_z, 0.4));
		}
	}
</style>
