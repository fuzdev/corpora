<script lang="ts">
	import { resolve } from '$app/paths';

	import { samples as all_samples } from '$routes/samples/all.ts';
	import BenchmarkResults from './BenchmarkResults.svelte';
	import BenchmarkHarness from './BenchmarkHarness.svelte';
	import { run_all_benchmarks } from './benchmark_runner.ts';
	import { implementations, languages } from './benchmark_fixtures.ts';
	import type { BenchmarkConfig, BenchmarkState } from './benchmark_types.ts';

	/* eslint-disable no-console */

	// To run Chromium with `gc` enabled:
	// `chromium --js-flags="--expose-gc"`

	// Configuration
	const config: BenchmarkConfig = $state({
		iterations: 5,
		warmup_count: 2,
		cooldown_ms: 50,
		content_multiplier: 10
	});

	// UI state
	let running = $state.raw(false);
	let current_test = $state.raw('');
	let progress = $state.raw(0);
	let total_tests = $state.raw(0);
	let should_stop = $state.raw(false);

	// Results state
	let benchmark_state: BenchmarkState | null = $state.raw(null);

	// Harness component reference
	let harness: BenchmarkHarness | undefined;

	// Run benchmark suite
	const run_benchmarks = async () => {
		if (!harness) throw Error();
		if (running) return;

		running = true;
		should_stop = false as boolean;
		current_test = '';
		progress = 0;

		// Reset state
		benchmark_state = {
			results: [],
			warnings: [],
			summary: null
		};

		// Calculate total for progress bar
		total_tests = implementations.length * languages.length * config.iterations;

		try {
			// Run benchmarks with progress callbacks
			benchmark_state = await run_all_benchmarks(all_samples, config, harness, {
				on_progress: (current, total) => {
					progress = current;
					total_tests = total;
				},
				on_test_start: (test) => {
					current_test = test;
				},
				should_stop: () => should_stop
			});

			current_test = should_stop ? 'Stopped' : 'Complete';
		} catch (error) {
			console.error('Benchmark failed:', error);
			benchmark_state.warnings.push(`Fatal error: ${error}`);
		} finally {
			running = false;
		}
	};

	// Stop benchmark
	const stop_benchmarks = () => {
		should_stop = true;
		current_test = 'Stopping...';
	};
</script>

<div class="box width_atmost_lg mx_auto">
	<h1 class="mt_xl5">benchmark</h1>
	<p><a href={resolve('/docs/benchmark')}>← benchmark docs</a></p>
	<p>
		For steadier numbers, expose GC:
		<code class="font-weight:400 font_size_sm">chromium --js-flags="--expose-gc"</code>
	</p>

	<section class="panel p_lg">
		<form>
			<fieldset>
				<legend>config</legend>
				<label>
					<div class="title">iterations</div>
					<input type="number" bind:value={config.iterations} min="1" disabled={running} />
				</label>

				<label>
					<div class="title">content multiplier</div>
					<input type="number" bind:value={config.content_multiplier} min="1" disabled={running} />
				</label>

				<label>
					<div class="title">warmup runs</div>
					<input type="number" bind:value={config.warmup_count} min="0" disabled={running} />
				</label>

				<label>
					<div class="title">cooldown (ms)</div>
					<input type="number" bind:value={config.cooldown_ms} min="0" disabled={running} />
				</label>
			</fieldset>

			<button type="button" onclick={run_benchmarks} disabled={running}>
				{running ? 'running...' : 'run benchmarks'}
			</button>
			{#if running}
				<button type="button" class="mt_lg" onclick={stop_benchmarks} style:margin-left="1rem">
					stop benchmark
				</button>
			{/if}
		</form>
	</section>

	{#if running}
		<section class="panel">
			<h3>Progress</h3>
			<div class="progress-info">
				<div>Testing: <strong>{current_test}</strong></div>
				<div>Progress: {progress} / {total_tests}</div>
			</div>
			<progress value={progress} max={total_tests}></progress>
		</section>
	{/if}

	{#if benchmark_state}
		<BenchmarkResults
			results={benchmark_state.results}
			summary={benchmark_state.summary}
			warnings={benchmark_state.warnings}
		/>
	{/if}

	<hr />
</div>

<BenchmarkHarness bind:this={harness} />
