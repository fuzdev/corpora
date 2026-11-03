// The hover-to-rebaseline ratios behind `BenchmarksBaselineGroup.svelte`: the
// shared row shape, the delegated hover read, and the ratio and its color scale for
// the speed (format/parse) and size groups.

import type { ImplementationCategory } from './benchmark_data.ts';
import type { FormattedUnit } from './benchmark_display.ts';

/**
 * An entry's ratio against its group's anchor. Every measurement here is
 * lower-is-better — a sweep's time, a build's bytes — so one formula serves the
 * speed and size groups alike: above 1 is that many times faster or smaller than
 * the anchor, below 1 that many times slower or bigger (`format_speedup` prints the
 * latter negated).
 */
export const compute_baseline_ratio = (entry_raw: number, anchor_raw: number): number =>
	anchor_raw / entry_raw;

/** Returns a CSS color variable for a baseline ratio. */
export const baseline_ratio_color = (ratio: number): string => {
	if (ratio < 0.5) return 'var(--palette_c_50)'; // red — much worse
	if (ratio < 1) return 'var(--palette_h_50)'; // orange — worse
	if (ratio < 2) return 'var(--palette_e_50)'; // yellow — modest
	if (ratio < 5) return 'var(--palette_b_50)'; // green — better
	return 'var(--palette_j_50)'; // teal — exceptional
};

/**
 * The row under the pointer's baseline key, read off its `data-baseline-key` — how
 * a group or table re-baselines from one delegated `pointerover` rather than a
 * handler per row. Pointer rather than mouse events: `pointerover` bubbles to the
 * container as `mouseenter` wouldn't, and it brings pen and touch along, where a
 * tap re-baselines the row it lands on and the lift restores the default.
 *
 * @returns the key, or `undefined` over anything that publishes none (the gaps
 * between rows, a disabled placeholder), which restores the default anchor
 */
export const to_baseline_key = (event: Event): string | undefined =>
	(event.target as Element | null)?.closest<HTMLElement>('[data-baseline-key]')?.dataset
		.baselineKey;

/**
 * A normalized row for `BenchmarksBaselineGroup` — the shared hover-to-rebaseline
 * column behind the format, parse, and binary-size groups. `raw` is the number the
 * ratio derives from (sweep mean ns for speed, bytes for size); `value` is the
 * row's displayed measurement (the whole-sweep mean — total time over the group's
 * iterated corpus — for speed, bytes for size). Flattening the group-specific
 * display entries to this one shape lets a single component own the anchor state
 * for all three sections.
 */
export interface BaselineRow {
	// stable identity for `#each` and anchor matching (the entry name / size label)
	key: string;
	// raw name/label; `BenchmarksBar` formats it for display
	label: string;
	category: ImplementationCategory;
	bar_fraction: number;
	value: FormattedUnit;
	// the number the ratio derives from — mean ns (speed) or bytes (size)
	raw: number;
	annotation: string | undefined;
	// grayed-out, inert placeholder — never an anchor, no hover highlight
	disabled: boolean;
	// what a disabled row reads instead of a value; the bar defaults it to `no API`.
	// A coverage-only row (see `BenchmarkDisplayEntry.coverage_only`) states why it
	// went untimed, via `format_untimed_reason`
	placeholder?: string;
}
