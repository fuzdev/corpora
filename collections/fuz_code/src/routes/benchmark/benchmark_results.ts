/**
 * Benchmark results display utilities.
 * Uses fuz_util's time formatting for consistent display.
 */

import { TIME_NS_PER_MS } from '@fuzdev/fuz_util/time.ts';

import { fmt } from './benchmark_stats.ts';
import type { BenchmarkResult } from './benchmark_types.ts';

/**
 * Helper to convert nanoseconds to milliseconds for display.
 */
const ns_to_ms = (ns: number): number => ns / TIME_NS_PER_MS;

/**
 * Column definitions for benchmark results table.
 */
export interface ResultColumn {
	header: string;
	get_value: (result: BenchmarkResult) => string;
	get_class?: (result: BenchmarkResult) => string;
}

export const RESULT_COLUMNS: Array<ResultColumn> = [
	{
		header: 'Language',
		get_value: (r) => r.language
	},
	{
		header: 'Implementation',
		get_value: (r) => r.implementation
	},
	{
		header: 'Mean (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.mean_ns))
	},
	{
		header: 'Paint (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.paint.mean_ns))
	},
	{
		header: 'Median (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.p50_ns))
	},
	{
		header: 'Std Dev',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.std_dev_ns))
	},
	{
		header: 'CV',
		get_value: (r) => `${fmt(r.stats.core.cv * 100, 1)}%`,
		get_class: (r) => (r.stats.core.cv > 0.15 ? 'warning' : '')
	},
	{
		header: 'P75 (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.p75_ns))
	},
	{
		header: 'P90 (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.p90_ns))
	},
	{
		header: 'P95 (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.p95_ns))
	},
	{
		header: 'P99 (ms)',
		get_value: (r) => fmt(ns_to_ms(r.stats.core.p99_ns))
	},
	{
		header: 'Ops/sec',
		get_value: (r) => fmt(r.stats.core.ops_per_second, 0)
	},
	{
		header: 'Outliers',
		get_value: (r) => `${r.stats.core.outliers_ns.length}/${r.stats.core.raw_sample_size}`,
		get_class: (r) => (r.stats.core.outlier_ratio > 0.1 ? 'warning' : '')
	},
	{
		header: 'Failed',
		get_value: (r) => r.stats.core.failed_iterations.toString(),
		get_class: (r) => (r.stats.core.failed_iterations > 0 ? 'warning' : '')
	},
	{
		header: 'Stability',
		get_value: (r) => `${fmt(r.stats.stability_ratio * 100, 0)}%`,
		get_class: (r) => (r.stats.stability_ratio > 0.9 ? 'good' : '')
	}
];

/**
 * Convert benchmark results to a markdown table.
 */
export const results_to_markdown = (results: Array<BenchmarkResult>): string => {
	if (results.length === 0) return '';

	// Header
	const headers = RESULT_COLUMNS.map((col) => col.header);
	let markdown = '| ' + headers.join(' | ') + ' |\n';
	markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

	// Add rows
	for (const result of results) {
		const row = RESULT_COLUMNS.map((col) => col.get_value(result));
		markdown += '| ' + row.join(' | ') + ' |\n';
	}

	return markdown;
};
