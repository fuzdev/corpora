import { TIME_NS_PER_MS } from '@fuzdev/fuz_util/time.ts';

import type {
	BenchmarkedImplementation,
	MeasurementData,
	BenchmarkConfig,
	BenchmarkResult,
	ProgressCallbacks,
	BenchmarkState,
	BenchmarkHarnessController,
	BenchmarkComponentProps
} from './benchmark_types.ts';
import type { CodeSample } from '#lib/code_sample.ts';
import { inter_test_cooldown } from './benchmark_dom.ts';
import {
	check_system_stability,
	get_instability_reason,
	extended_cooldown
} from './benchmark_stability.ts';
import { implementations, languages, pre_generate_large_contents } from './benchmark_fixtures.ts';
import { analyze_results, calculate_summary, check_high_variance } from './benchmark_stats.ts';

/* eslint-disable no-console */

// Timing validation constants
const MIN_VALID_TIMING_MS = 0.01;
const MAX_VALID_TIMING_MS = 60000;
const SUSPICIOUS_MEAN_MS = 0.1;
const HIGH_OUTLIER_RATIO = 0.2;

// Warmup phase using harness with large content
export const warmup_phase = async (
	impl: BenchmarkedImplementation,
	content: string,
	lang: string,
	warmup_count: number,
	cooldown_ms: number,
	harness: BenchmarkHarnessController
): Promise<void> => {
	for (let i = 0; i < warmup_count; i++) {
		const props: BenchmarkComponentProps = { content, lang };
		if (impl.mode !== null) {
			props.mode = impl.mode;
		}

		await harness.run_iteration(impl.component, props);

		await inter_test_cooldown(cooldown_ms);
	}
};

// Run measurements for a single implementation using harness with large content
export const measurement_phase = async (
	impl: BenchmarkedImplementation,
	content: string,
	lang: string,
	config: BenchmarkConfig,
	harness: BenchmarkHarnessController,
	on_progress?: () => void,
	should_stop?: () => boolean
): Promise<MeasurementData> => {
	const work_ms: Array<number> = [];
	const paint_ms: Array<number> = [];
	const stability_checks = [];
	// the jitter window is this test's own timings, so one workload's spread
	// isn't read against another's
	const recent_timings: Array<number> = [];

	for (let i = 0; i < config.iterations; i++) {
		// Check for stop signal
		if (should_stop?.()) {
			console.log('[Measurement] Stopped by user');
			break;
		}

		console.log(`[Measurement] Iteration ${i + 1}/${config.iterations}`);

		// Cooldown between tests
		await inter_test_cooldown(config.cooldown_ms);

		const stability = await check_system_stability(recent_timings);
		stability_checks.push(stability);

		if (!stability.is_stable) {
			const reason = get_instability_reason(stability);
			console.log(`[Measurement] System unstable: ${reason}, extended cooldown...`);
			await extended_cooldown(reason);
		}

		const props: BenchmarkComponentProps = { content, lang };
		if (impl.mode !== null) {
			props.mode = impl.mode;
		}

		console.log(`[Measurement] Running iteration ${i + 1}...`);

		try {
			const { work_ms: work, paint_ms: paint } = await harness.run_iteration(impl.component, props);

			// Validate against the work time — the styler's compute cost — and
			// keep the two series index-aligned (a failed iteration is NaN in both).
			if (work <= 0 || work > MAX_VALID_TIMING_MS) {
				console.warn(
					work <= 0
						? `[Measurement] Suspicious timing (${work}ms) - marking as failed`
						: `[Measurement] Extremely slow timing (${work}ms) - possible hang`
				);
				work_ms.push(NaN);
				paint_ms.push(NaN);
			} else {
				if (work < MIN_VALID_TIMING_MS) {
					console.warn(
						`[Measurement] Suspiciously fast timing (${work}ms) - possible no-op render`
					);
				} else {
					console.log(
						`[Measurement] Iteration ${i + 1} complete: ${work.toFixed(2)}ms work / ${paint.toFixed(2)}ms paint`
					);
				}
				work_ms.push(work);
				paint_ms.push(paint);
				recent_timings.push(work);
			}
		} catch (error) {
			// record the failure and continue rather than failing the whole test
			console.error(`[Measurement] Iteration ${i + 1} failed:`, error);
			work_ms.push(NaN);
			paint_ms.push(NaN);
		}

		if (on_progress) {
			on_progress();
		}

		// a minor collection only: a forced full one discards optimized code, so
		// the next iteration would re-optimize inside the clock
		if (globalThis.gc) {
			globalThis.gc({ type: 'minor' });
		}
	}

	return { work_ms, paint_ms, stability_checks };
};

// Run complete benchmark suite
export const run_all_benchmarks = async (
	samples: Record<string, CodeSample>,
	config: BenchmarkConfig,
	harness: BenchmarkHarnessController,
	callbacks?: ProgressCallbacks,
	custom_implementations?: Array<BenchmarkedImplementation>,
	custom_languages?: Array<string>
): Promise<BenchmarkState> => {
	const impls = custom_implementations || implementations;
	const langs = custom_languages || languages;
	const results: Array<BenchmarkResult> = [];
	const warnings: Array<string> = [];

	const total_tests = impls.length * langs.length;
	const total_iterations = total_tests * config.iterations;
	let current_progress = 0;

	// Pre-generate all large content before benchmarking
	console.log(`[Runner] Pre-generating large content (${config.content_multiplier}x)...`);
	const contents = pre_generate_large_contents(samples, langs, config.content_multiplier);
	console.log('[Runner] Pre-generation complete');

	for (const lang of langs) {
		// Check for stop signal
		if (callbacks?.should_stop?.()) {
			console.log('[Runner] Benchmark stopped by user');
			break;
		}

		// Get pre-generated large content for this language
		const content = contents.get(lang);

		if (!content) {
			warnings.push(`No complex sample found for ${lang}`);
			continue;
		}

		for (const impl of impls) {
			// Check for stop signal
			if (callbacks?.should_stop?.()) {
				console.log('[Runner] Benchmark stopped by user');
				break;
			}
			const test_name = `${impl.name} / ${lang}`;
			console.log(`\n[Runner] Starting test: ${test_name}`);

			if (callbacks?.on_test_start) {
				callbacks.on_test_start(test_name);
			}

			try {
				// Warmup with large content
				await warmup_phase(impl, content, lang, config.warmup_count, config.cooldown_ms, harness);

				// Measurement with progress tracking and large content
				const measurement_data = await measurement_phase(
					impl,
					content,
					lang,
					config,
					harness,
					() => {
						current_progress++;
						if (callbacks?.on_progress) {
							callbacks.on_progress(current_progress, total_iterations);
						}
					},
					callbacks?.should_stop
				);

				// Analysis
				const stats = analyze_results(measurement_data);
				const mean_ms = stats.core.mean_ns / TIME_NS_PER_MS;
				console.log(
					`[Runner] ${test_name} complete - mean: ${mean_ms.toFixed(2)}ms, ops/sec: ${stats.core.ops_per_second.toFixed(2)}`
				);

				// Check for suspicious results
				if (stats.core.failed_iterations > 0) {
					warnings.push(`${test_name}: ${stats.core.failed_iterations} failed iterations`);
				}
				if (mean_ms < SUSPICIOUS_MEAN_MS) {
					warnings.push(`${test_name}: Suspiciously fast mean time (${mean_ms.toFixed(3)}ms)`);
				}
				if (stats.core.outlier_ratio > HIGH_OUTLIER_RATIO) {
					warnings.push(
						`${test_name}: High outlier ratio (${(stats.core.outlier_ratio * 100).toFixed(1)}%)`
					);
				}

				results.push({
					implementation: impl.name,
					language: lang,
					stats
				});

				if (callbacks?.on_test_complete) {
					callbacks.on_test_complete();
				}
			} catch (error) {
				console.error(`Error testing ${impl.name}/${lang}:`, error);
				warnings.push(`Failed: ${impl.name}/${lang}`);
			}
		}
	}

	// Calculate summary statistics
	const summary = calculate_summary(results);

	// Check for high variance
	const variance_warnings = check_high_variance(results);
	warnings.push(...variance_warnings);

	// Add stopped message if applicable
	if (callbacks?.should_stop?.()) {
		warnings.push('Benchmark was stopped by user');
	}

	// Clean up harness
	await harness.cleanup();

	return { results, warnings, summary };
};
