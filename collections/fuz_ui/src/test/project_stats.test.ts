import { assert, describe, test } from 'vitest';

import {
	daily_counts_from_timestamps,
	daily_counts_pad_start,
	date_from_epoch_day,
	epoch_day_from_date,
	monthly_counts_from_daily,
	project_stats_label,
	project_stats_to_monthly_series,
	project_stats_to_weekly_series,
	weekly_counts_from_daily,
	type ProjectStatsSnapshot
} from '$lib/project_stats.ts';

const DAY_SECONDS = 86_400;

describe('epoch_day_from_date', () => {
	test('converts the epoch date to 0', () => {
		assert.strictEqual(epoch_day_from_date('1970-01-01'), 0);
	});

	test('round trips with date_from_epoch_day', () => {
		for (const date of ['1970-01-01', '1999-12-31', '2024-02-29', '2026-08-11']) {
			assert.strictEqual(date_from_epoch_day(epoch_day_from_date(date)), date);
		}
	});
});

describe('daily_counts_from_timestamps', () => {
	test('returns null for empty timestamps', () => {
		assert.isNull(daily_counts_from_timestamps([], '2026-08-11'));
	});

	test('buckets timestamps by UTC day through end_date', () => {
		// two commits on day 0, one late on day 1, none on day 2, end_date on day 3
		const timestamps = [0, DAY_SECONDS - 1, 2 * DAY_SECONDS - 1];
		const result = daily_counts_from_timestamps(timestamps, '1970-01-04');
		assert.ok(result);
		assert.strictEqual(result.start_date, '1970-01-01');
		assert.deepEqual(result.daily_counts, [2, 1, 0, 0]);
	});

	test('clamps timestamps after end_date into the final bucket', () => {
		const timestamps = [0, 5 * DAY_SECONDS];
		const result = daily_counts_from_timestamps(timestamps, '1970-01-02');
		assert.ok(result);
		assert.deepEqual(result.daily_counts, [1, 1]);
	});
});

describe('daily_counts_pad_start', () => {
	test('pads with leading zeros to the earlier start', () => {
		assert.deepEqual(daily_counts_pad_start([3, 1], '1970-01-04', '1970-01-01'), [0, 0, 0, 3, 1]);
	});

	test('returns the input unchanged when the padded start is not earlier', () => {
		const daily_counts = [3, 1];
		assert.strictEqual(
			daily_counts_pad_start(daily_counts, '1970-01-04', '1970-01-04'),
			daily_counts
		);
		assert.strictEqual(
			daily_counts_pad_start(daily_counts, '1970-01-04', '1970-01-05'),
			daily_counts
		);
	});
});

describe('monthly_counts_from_daily', () => {
	test('buckets by UTC calendar month with partial edge months', () => {
		// Jan 30, Jan 31, Feb 1, Feb 2
		assert.deepEqual(monthly_counts_from_daily([1, 2, 3, 4], '1970-01-30'), [3, 7]);
	});

	test('preserves the total count across buckets', () => {
		const daily_counts = Array.from({ length: 90 }, (_, i) => i % 5);
		const monthly = monthly_counts_from_daily(daily_counts, '2026-01-15');
		assert.strictEqual(
			monthly.reduce((a, b) => a + b, 0),
			daily_counts.reduce((a, b) => a + b, 0)
		);
	});

	test('spans month boundaries with empty months intact', () => {
		// 62 days from Mar 1: all of March (31), all of April (30), May 1
		const daily_counts = new Array(62).fill(0);
		daily_counts[0] = 5; // Mar 1
		daily_counts[61] = 2; // May 1
		assert.deepEqual(monthly_counts_from_daily(daily_counts, '2026-03-01'), [5, 0, 2]);
	});
});

describe('weekly_counts_from_daily', () => {
	test('chunks 7-day buckets anchored at the end', () => {
		// 10 days: partial first bucket of 3, full last bucket of 7
		assert.deepEqual(weekly_counts_from_daily([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [6, 49]);
	});

	test('handles exact multiples of 7', () => {
		const daily_counts = new Array(14).fill(1);
		assert.deepEqual(weekly_counts_from_daily(daily_counts), [7, 7]);
	});

	test('returns empty for empty input', () => {
		assert.deepEqual(weekly_counts_from_daily([]), []);
	});
});

describe('project_stats_to_weekly_series', () => {
	test('aligns weekly series to a shared window with a shared max', () => {
		const snapshot: ProjectStatsSnapshot = {
			generated_at: '2026-08-11T00:00:00.000Z',
			end_date: '1970-01-14',
			projects: [
				{
					// 14 days
					name: 'older',
					start_date: '1970-01-01',
					daily_counts: [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
				},
				{
					// 3 days, padded to 14
					name: 'younger',
					start_date: '1970-01-12',
					daily_counts: [2, 2, 2]
				}
			]
		};
		const { series, max } = project_stats_to_weekly_series(snapshot);
		assert.deepEqual(series[0]!.counts, [9, 1]);
		assert.deepEqual(series[1]!.counts, [0, 6]);
		assert.strictEqual(max, 9);
	});
});

describe('project_stats_label', () => {
	test('formats the name, comma-separated total, and start date', () => {
		assert.strictEqual(
			project_stats_label({
				name: 'gro',
				start_date: '2019-08-07',
				daily_counts: [2000, 386]
			}),
			'gro — 2,386 commits since August 7, 2019'
		);
	});
});

describe('project_stats_to_monthly_series', () => {
	test('aligns series to a shared window and computes the shared max', () => {
		const snapshot: ProjectStatsSnapshot = {
			generated_at: '2026-08-11T00:00:00.000Z',
			end_date: '1970-03-03',
			projects: [
				{
					// Jan 1 through Mar 3
					name: 'older',
					start_date: '1970-01-01',
					daily_counts: [4, ...new Array(59).fill(0), 1, 1]
				},
				{
					// Mar 1 through Mar 3
					name: 'younger',
					start_date: '1970-03-01',
					daily_counts: [7, 0, 2]
				}
			]
		};
		const { series, max } = project_stats_to_monthly_series(snapshot);
		assert.strictEqual(series.length, 2);
		// shared window Jan..Mar → 3 monthly buckets for both
		assert.deepEqual(
			series.map((s) => s.counts.length),
			[3, 3]
		);
		assert.deepEqual(series[0]!.counts, [4, 0, 2]);
		assert.deepEqual(series[1]!.counts, [0, 0, 9]);
		assert.strictEqual(max, 9);
	});

	test('returns empty for an empty snapshot', () => {
		const { series, max } = project_stats_to_monthly_series({
			generated_at: '2026-08-11T00:00:00.000Z',
			end_date: '2026-08-11',
			projects: []
		});
		assert.deepEqual(series, []);
		assert.strictEqual(max, 0);
	});
});
