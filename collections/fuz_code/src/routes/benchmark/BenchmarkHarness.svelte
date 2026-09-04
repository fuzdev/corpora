<script lang="ts">
	import { tick, type Component } from 'svelte';

	import type { BenchmarkComponentProps, IterationTiming } from './benchmark_types.ts';
	import BenchmarkInstance from './BenchmarkInstance.svelte';

	/* eslint-disable no-console */

	const RENDER_TIMEOUT_MS = 10000;

	let current_component: Component<BenchmarkComponentProps> | null = $state.raw(null);
	let current_props: BenchmarkComponentProps | null = $state.raw(null);
	let commit_resolver: (() => void) | null = null;
	let commit_rejector: ((error: Error) => void) | null = null;
	let paint_resolver: (() => void) | null = null;
	let paint_rejector: ((error: Error) => void) | null = null;
	let iteration_key = $state.raw(0);
	const handle_commit = () => {
		if (commit_resolver) {
			commit_resolver();
			commit_resolver = null;
			commit_rejector = null;
		}
	};
	const handle_paint = () => {
		if (paint_resolver) {
			paint_resolver();
			paint_resolver = null;
			paint_rejector = null;
		}
	};

	let active_timeout_id: ReturnType<typeof setTimeout> | undefined;
	export const run_iteration = async (
		component: Component<BenchmarkComponentProps>,
		props: BenchmarkComponentProps
	): Promise<IterationTiming> => {
		iteration_key++;

		// Both boundaries are measured from the same `start`. The commit promise
		// resolves when the highlight work is laid out; the paint promise resolves
		// a couple of frames later once pixels settle.
		const commit_promise: Promise<void> = new Promise((resolve, reject) => {
			commit_resolver = resolve;
			commit_rejector = reject;
		});
		const paint_promise: Promise<void> = new Promise((resolve, reject) => {
			paint_resolver = resolve;
			paint_rejector = reject;
		});

		// The timeout rejects whichever boundary is still pending, so a render that
		// never commits (component throws in onMount) fails the iteration instead of
		// hanging on `await commit_promise`. Only the awaited boundary is rejected —
		// the other is either already resolved or never awaited past this point.
		active_timeout_id = setTimeout(() => {
			console.error('[Harness] Render timeout after', RENDER_TIMEOUT_MS, 'ms');
			const error = new Error(`Render timeout after ${RENDER_TIMEOUT_MS}ms`);
			if (commit_resolver) {
				commit_rejector?.(error);
			} else if (paint_resolver) {
				paint_rejector?.(error);
			}
			commit_resolver = null;
			commit_rejector = null;
			paint_resolver = null;
			paint_rejector = null;
			active_timeout_id = undefined;
		}, RENDER_TIMEOUT_MS);

		const start = performance.now();

		try {
			current_component = component;
			current_props = props;

			await commit_promise;
			const work_ms = performance.now() - start;

			await paint_promise;
			const paint_ms = performance.now() - start;

			if (active_timeout_id) {
				clearTimeout(active_timeout_id);
				active_timeout_id = undefined;
			}

			return { work_ms, paint_ms };
		} catch (error) {
			console.error('[Harness] Render failed:', error);
			throw error;
		} finally {
			await cleanup();
		}
	};
	export const cleanup = async (): Promise<void> => {
		current_component = null;
		current_props = null;
		commit_resolver = null;
		commit_rejector = null;
		paint_resolver = null;
		paint_rejector = null;

		if (active_timeout_id) {
			clearTimeout(active_timeout_id);
			active_timeout_id = undefined;
		}

		await tick();
	};
</script>

{#if current_component && current_props}
	<!-- Render the measured content in a visible on-screen region so the browser
	     actually rasterizes it each iteration. An off-screen render settles the
	     paint promise on the rAF floor (~2 idle frames) without painting real
	     pixels, which flattens the paint numbers. Fixed to the right edge, clipped
	     to the viewport, and non-interactive so the running UI stays usable. -->
	<div class="benchmark-stage" aria-hidden="true">
		{#key iteration_key}
			<BenchmarkInstance
				BenchmarkedComponent={current_component}
				props={current_props}
				on_commit={handle_commit}
				on_paint={handle_paint}
			/>
		{/key}
	</div>
{/if}

<style>
	.benchmark-stage {
		position: fixed;
		inset-block: 0;
		right: 0;
		width: min(50vw, 600px);
		overflow: hidden;
		pointer-events: none;
		z-index: 100;
		background-color: var(--fg_05);
	}
</style>
