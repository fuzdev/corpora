<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';

	const {
		to,
		onmove,
		children
	}: {
		/**
		 * Defaults to `undefined` to lessen friction with SSR.
		 * We may want to change this to optionally accept a string selector,
		 * but that didn't seem to be the best API for the `Dialog`.
		 */
		to?: HTMLElement | undefined | null;
		onmove?: (el: HTMLElement, to: HTMLElement) => void;
		children: Snippet;
	} = $props();

	let el: HTMLElement | undefined | null = $state.raw();

	$effect(() => {
		if (el && to) {
			move(el, to);
		}
	});

	let moved = $state.raw(false);

	const move = (el: HTMLElement, to: HTMLElement): void => {
		moved = true;
		to.appendChild(el);
		onmove?.(el, to);
	};

	onDestroy(() => {
		el?.parentNode?.removeChild(el);
	});
</script>

<div class="teleport" bind:this={el} hidden={!moved}>
	{@render children()}
</div>

<style>
	.teleport {
		display: contents;
	}
</style>
