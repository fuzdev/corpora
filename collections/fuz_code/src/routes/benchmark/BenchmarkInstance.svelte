<script lang="ts">
	import { onMount, type Component } from 'svelte';

	import type { BenchmarkComponentProps } from './benchmark_types.ts';
	import { ensure_paint } from './benchmark_dom.ts';

	const {
		BenchmarkedComponent = null,
		props = null,
		on_commit = () => {},
		on_paint = () => {}
	}: {
		BenchmarkedComponent: Component<BenchmarkComponentProps> | null;
		props: BenchmarkComponentProps | null;
		/** Fires once the highlight work is committed and laid out (work boundary). */
		on_commit?: () => void;
		/** Fires once the browser has settled pixels, ~1-2 frames later (paint boundary). */
		on_paint?: () => void;
	} = $props();

	let container_el: HTMLDivElement;

	// The child component mounts and inserts its DOM before this parent onMount
	// runs, so reading layout here forces style + layout to complete synchronously.
	// `on_commit` therefore marks the end of the actual highlight work (stylize +
	// DOM build + layout); `on_paint` fires after `ensure_paint` once pixels have
	// settled. The two are reported separately so the frame-quantized paint wait
	// doesn't get charged to the highlighter's compute cost.
	onMount(async () => {
		// Force layout recalculation for all modes to ensure consistent timing,
		// and read the values so they can't be optimized away.
		const code_el = container_el.querySelector('code');
		const rect = code_el!.getBoundingClientRect();
		const height = code_el!.offsetHeight;
		if (rect.width <= 0 || height <= 0) {
			console.error('Unexpected negative dimensions'); // eslint-disable-line no-console
		}

		on_commit();

		await ensure_paint();

		on_paint();
	});
</script>

<div bind:this={container_el}>
	{#if BenchmarkedComponent && props}
		<BenchmarkedComponent {...props} />
	{/if}
</div>
