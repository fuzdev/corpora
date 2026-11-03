/**
 * Statistical analysis functions for browser benchmark results.
 * Uses fuz_util's BenchmarkStats for core statistics, adding browser-specific stability tracking.
 */

import { BenchmarkStats } from '@fuzdev/fuz_util/benchmark_stats.ts';
import { TIME_NS_PER_MS } from '@fuzdev/fuz_util/time.ts';

import type {
	BenchmarkResult,
	BrowserBenchmarkStats,
	MeasurementData,
	SummaryStats
} from './benchmark_types.ts';

/**
 * Analyze measurement data and return browser benchmark stats.
 * Converts millisecond timings to nanoseconds for fuz_util's BenchmarkStats.
 */
export const analyze_results = (data: MeasurementData): BrowserBenchmarkStats => {
	// Convert milliseconds to nanoseconds for BenchmarkStats. `core` is the work
	// time (the styler's compute cost); `paint` adds the frames until pixels
	// settle. Both series are index-aligned, so failed iterations drop out of each.
	const core = new BenchmarkStats(data.work_ms.map((ms) => ms * TIME_NS_PER_MS));
	const paint = new BenchmarkStats(data.paint_ms.map((ms) => ms * TIME_NS_PER_MS));

	// Calculate browser-specific stability metrics
	const unstable_count = data.stability_checks.filter((s) => !s.is_stable).length;
	const stability_ratio =
		data.stability_checks.length > 0 ? 1 - unstable_count / data.stability_checks.length : 1;

	return {
		core,
		paint,
		stability_ratio,
		unstable_iterations: unstable_count
	};
};

const geomean = (values: Array<number>): number =>
	Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length);

/**
 * Calculate summary statistics across all test results. Times and rates are
 * geometric means across languages, so each language weighs the same however
 * long its sample takes.
 */
export const calculate_summary = (
	results: Array<BenchmarkResult>
): Record<string, SummaryStats> => {
	const by_impl: Record<string, Array<BenchmarkResult>> = {};

	for (const result of results) {
		(by_impl[result.implementation] ??= []).push(result);
	}

	const summary: Record<string, SummaryStats> = {};

	for (const [impl, impl_results] of Object.entries(by_impl)) {
		const geomean_ms = geomean(impl_results.map((r) => r.stats.core.mean_ns / TIME_NS_PER_MS));
		const geomean_ops = geomean(impl_results.map((r) => r.stats.core.ops_per_second));
		const avg_cv =
			impl_results.map((r) => r.stats.core.cv).reduce((a, b) => a + b, 0) / impl_results.length;

		summary[impl] = {
			geomean_ms,
			geomean_ops,
			avg_cv,
			languages: impl_results.length
		};
	}

	// Calculate relative performance (only if baseline exists)
	const baseline_ms = summary.html?.geomean_ms;
	if (baseline_ms !== undefined) {
		for (const impl of Object.keys(summary)) {
			const impl_summary = summary[impl]!;
			impl_summary.relative_speed = baseline_ms / impl_summary.geomean_ms;
			impl_summary.improvement = (impl_summary.relative_speed - 1) * 100;
		}
	}

	return summary;
};

/**
 * Check for high coefficient of variation in results.
 */
export const check_high_variance = (
	results: Array<BenchmarkResult>,
	threshold = 0.15
): Array<string> => {
	const warnings: Array<string> = [];

	for (const result of results) {
		if (result.stats.core.cv > threshold) {
			warnings.push(
				`High variance for ${result.implementation}/${result.language}: CV=${(result.stats.core.cv * 100).toFixed(1)}%`
			);
		}
	}

	return warnings;
};

/**
 * Format number for display.
 */
export const fmt = (n: number, decimals = 2): string => {
	if (!isFinite(n)) return String(n);
	return n.toFixed(decimals);
};
