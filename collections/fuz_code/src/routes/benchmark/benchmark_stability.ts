import type { StabilityCheck } from './benchmark_types.ts';
const MIN_SAMPLES_FOR_JITTER = 5;
const RECENT_SAMPLE_COUNT = 10;
const MAX_ACCEPTABLE_LAG_MS = 5;
const MAX_MEMORY_PRESSURE = 0.9;
const MAX_JITTER_RATIO = 2;

const COOLDOWN_TIMES: Record<string, number> = {
	high_lag: 200,
	memory_pressure: 500,
	high_jitter: 300,
	unknown: 300
};
export const calculate_timing_jitter = (recent_timings: Array<number>): number => {
	if (recent_timings.length < MIN_SAMPLES_FOR_JITTER) return 0;

	const recent = recent_timings.slice(-RECENT_SAMPLE_COUNT);
	const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
	const variance = recent.reduce((sum, val) => sum + (val - mean) ** 2, 0) / recent.length;
	const std_dev = Math.sqrt(variance);

	return std_dev / mean;
};
export const check_system_stability = async (
	recent_timings: Array<number>
): Promise<StabilityCheck> => {
	const lag_start = performance.now();
	await new Promise((resolve) => setTimeout(resolve, 0));
	const lag = performance.now() - lag_start;

	let memory_pressure = 0;
	// @ts-ignore
	if (typeof performance !== 'undefined' && performance.memory) {
		// @ts-ignore
		memory_pressure = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
	}

	const jitter = calculate_timing_jitter(recent_timings);

	const is_stable =
		lag < MAX_ACCEPTABLE_LAG_MS &&
		memory_pressure < MAX_MEMORY_PRESSURE &&
		jitter < MAX_JITTER_RATIO;

	return { is_stable, lag, memory_pressure, jitter };
};
export const get_instability_reason = (stability: StabilityCheck): string => {
	if (stability.lag > MAX_ACCEPTABLE_LAG_MS) return 'high_lag';
	if (stability.jitter > MAX_JITTER_RATIO) return 'high_jitter';
	if (stability.memory_pressure && stability.memory_pressure > MAX_MEMORY_PRESSURE)
		return 'memory_pressure';
	return 'unknown';
};
export const extended_cooldown = async (reason: string): Promise<void> => {
	console.log(`System instability: ${reason}, waiting...`); // eslint-disable-line no-console
	await new Promise((resolve) =>
		setTimeout(resolve, COOLDOWN_TIMES[reason] || COOLDOWN_TIMES.unknown)
	);
};
