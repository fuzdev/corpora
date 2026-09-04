import type { SvelteHTMLElements } from 'svelte/elements';
import type { Component } from 'svelte';
import type { BenchmarkStats as FuzBenchmarkStats } from '@fuzdev/fuz_util/benchmark_stats.ts';

import type { ImplementationName } from './benchmark_fixtures.ts';

export type BenchmarkComponentProps = SvelteHTMLElements['code'] & {
	content: string;
	lang: string;
	mode?: 'html' | 'ranges' | 'auto';
};

export interface BenchmarkConfig {
	iterations: number;
	warmup_count: number;
	cooldown_ms: number;
	content_multiplier: number;
}

export interface BenchmarkedImplementation {
	name: string;
	component: Component<BenchmarkComponentProps>;
	mode: 'html' | 'ranges' | 'auto' | null;
}

export interface StabilityCheck {
	is_stable: boolean;
	lag: number;
	memory_pressure?: number;
	jitter: number;
}

/**
 * One iteration's two timings, both measured from the same start (props set):
 * `work_ms` ends when the highlight work is committed and laid out; `paint_ms`
 * ends once the browser has settled pixels (adds ~1-2 animation frames).
 */
export interface IterationTiming {
	work_ms: number;
	paint_ms: number;
}

export interface MeasurementData {
	/** Per-iteration work time — stylize + DOM commit + forced layout (ms). */
	work_ms: Array<number>;
	/** Per-iteration paint-settled time — work plus the frames until pixels update (ms). */
	paint_ms: Array<number>;
	stability_checks: Array<StabilityCheck>;
	timestamps: Array<number>;
}

/**
 * Browser benchmark stats extending fuz_util's BenchmarkStats with stability tracking.
 * Uses milliseconds for display (mean_ms, median_ms, etc.) while storing nanoseconds internally.
 */
export interface BrowserBenchmarkStats {
	/** Work-time stats — stylize + DOM commit, the highlighter's compute cost (in nanoseconds). */
	core: FuzBenchmarkStats;
	/** Paint-settled stats — work plus the frames until pixels update (in nanoseconds). */
	paint: FuzBenchmarkStats;
	/** Browser-specific: ratio of stable iterations (0-1) */
	stability_ratio: number;
	/** Browser-specific: count of unstable iterations */
	unstable_iterations: number;
}

/**
 * Benchmark result combining stats with test metadata.
 */
export interface BenchmarkResult {
	implementation: string;
	language: string;
	stats: BrowserBenchmarkStats;
}

export interface SummaryStats {
	avg_mean: number;
	avg_ops: number;
	avg_cv: number;
	languages: number;
	relative_speed?: number;
	improvement?: number;
}

// Benchmark harness controller interface
export interface BenchmarkHarnessController {
	run_iteration: (
		component: Component<BenchmarkComponentProps>,
		props: BenchmarkComponentProps
	) => Promise<IterationTiming>;
	cleanup: () => Promise<void>;
}

// Progress tracking callbacks
export interface ProgressCallbacks {
	on_progress?: (current: number, total: number) => void;
	on_test_start?: (test: string) => void;
	on_test_complete?: () => void;
	should_stop?: () => boolean;
}

// Benchmark runner state
export interface BenchmarkState {
	results: Array<BenchmarkResult>;
	warnings: Array<string>;
	summary: Record<ImplementationName, SummaryStats> | null;
}
