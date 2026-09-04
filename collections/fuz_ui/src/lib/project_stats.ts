/**
 * Types and pure helpers for project commit-activity stats.
 *
 * The committed dataset (`project_stats_data.ts`, written by the
 * `project_stats_update` task) stores daily commit counts per project as the
 * master granularity; coarser scopes like monthly are derived at runtime by
 * rebucketing. All date handling is UTC — `YYYY-MM-DD` strings and "epoch
 * days" (days since the Unix epoch) — so results are deterministic across
 * machines.
 *
 * @module
 */

const DAY_MS = 86_400_000;

/**
 * Daily commit counts for one project.
 */
export interface ProjectCommitStats {
	/**
	 * Project name, matching `project_items`.
	 */
	name: string;
	/**
	 * UTC date (`YYYY-MM-DD`) of the first day bucket, the day of the first commit.
	 */
	start_date: string;
	/**
	 * Commits per UTC day from `start_date` through the snapshot's `end_date`, inclusive.
	 */
	daily_counts: Array<number>;
}

/**
 * A snapshot of commit stats across projects, sharing a single `end_date`.
 */
export interface ProjectStatsSnapshot {
	/**
	 * ISO datetime when the snapshot was collected.
	 */
	generated_at: string;
	/**
	 * UTC date (`YYYY-MM-DD`) of the final day bucket, shared by every project.
	 */
	end_date: string;
	projects: Array<ProjectCommitStats>;
}

/**
 * A derived series of bucketed counts for one project.
 */
export interface ProjectStatsSeries {
	name: string;
	counts: Array<number>;
}

/**
 * Converts a UTC `YYYY-MM-DD` date to days since the Unix epoch.
 */
export const epoch_day_from_date = (date: string): number => {
	const [year, month, day] = date.split('-').map(Number);
	return Date.UTC(year!, month! - 1, day) / DAY_MS;
};

/**
 * Converts days since the Unix epoch to a UTC `YYYY-MM-DD` date.
 */
export const date_from_epoch_day = (epoch_day: number): string =>
	new Date(epoch_day * DAY_MS).toISOString().slice(0, 10);

/**
 * Buckets commit timestamps into daily counts from the earliest commit's UTC
 * day through `end_date`, inclusive.
 *
 * @param timestamps - commit times as Unix epoch seconds
 * @param end_date - UTC date (`YYYY-MM-DD`) of the final bucket; later timestamps clamp into it
 * @returns the start date and daily counts, or `null` if `timestamps` is empty
 */
export const daily_counts_from_timestamps = (
	timestamps: Array<number>,
	end_date: string
): { start_date: string; daily_counts: Array<number> } | null => {
	if (timestamps.length === 0) return null;
	const days = timestamps.map((t) => Math.floor((t * 1000) / DAY_MS));
	const end_day = epoch_day_from_date(end_date);
	let start_day = end_day;
	for (const day of days) {
		if (day < start_day) start_day = day;
	}
	const daily_counts: Array<number> = new Array(end_day - start_day + 1).fill(0);
	for (const day of days) {
		daily_counts[Math.min(day, end_day) - start_day]! += 1;
	}
	return { start_date: date_from_epoch_day(start_day), daily_counts };
};

/**
 * Pads `daily_counts` with leading zeros so the series starts at
 * `padded_start_date` instead of `start_date`.
 *
 * Returns the input array unchanged when `padded_start_date` is not earlier
 * than `start_date`.
 */
export const daily_counts_pad_start = (
	daily_counts: Array<number>,
	start_date: string,
	padded_start_date: string
): Array<number> => {
	const pad = epoch_day_from_date(start_date) - epoch_day_from_date(padded_start_date);
	if (pad <= 0) return daily_counts;
	return (new Array(pad).fill(0) as Array<number>).concat(daily_counts);
};

/**
 * Rebuckets daily counts into calendar-month (UTC) counts.
 *
 * The first and last buckets may cover partial months.
 */
export const monthly_counts_from_daily = (
	daily_counts: Array<number>,
	start_date: string
): Array<number> => {
	const start_day = epoch_day_from_date(start_date);
	const counts: Array<number> = [];
	let current_month_key: number | null = null;
	for (let i = 0; i < daily_counts.length; i++) {
		const date = new Date((start_day + i) * DAY_MS);
		const month_key = date.getUTCFullYear() * 12 + date.getUTCMonth();
		if (month_key !== current_month_key) {
			current_month_key = month_key;
			counts.push(0);
		}
		counts[counts.length - 1]! += daily_counts[i]!;
	}
	return counts;
};

/**
 * Rebuckets daily counts into 7-day counts, anchored at the end of the series
 * so the newest bucket always covers a full 7 days.
 *
 * The first bucket may cover fewer days when the length isn't a multiple of 7.
 */
export const weekly_counts_from_daily = (daily_counts: Array<number>): Array<number> => {
	const counts: Array<number> = [];
	for (let end = daily_counts.length; end > 0; end -= 7) {
		let sum = 0;
		for (let i = Math.max(0, end - 7); i < end; i++) {
			sum += daily_counts[i]!;
		}
		counts.push(sum);
	}
	return counts.reverse();
};

const to_aligned_series = (
	snapshot: ProjectStatsSnapshot,
	rebucket: (daily_counts: Array<number>, start_date: string) => Array<number>
): { series: Array<ProjectStatsSeries>; max: number } => {
	if (snapshot.projects.length === 0) return { series: [], max: 0 };
	let shared_start = snapshot.projects[0]!.start_date;
	for (const project of snapshot.projects) {
		if (project.start_date < shared_start) shared_start = project.start_date;
	}
	let max = 0;
	const series = snapshot.projects.map((project) => {
		const daily = daily_counts_pad_start(project.daily_counts, project.start_date, shared_start);
		const counts = rebucket(daily, shared_start);
		for (const count of counts) {
			if (count > max) max = count;
		}
		return { name: project.name, counts };
	});
	return { series, max };
};

/**
 * Derives aligned monthly series for every project in `snapshot`, sharing one
 * time window and one scale.
 *
 * Each series spans from the earliest project's `start_date` through the
 * snapshot's `end_date` (younger projects are zero-padded at the front), so
 * all series have the same length and bucket boundaries. `max` is the largest
 * monthly count across all projects, for rendering every series at the same
 * vertical scale.
 */
export const project_stats_to_monthly_series = (
	snapshot: ProjectStatsSnapshot
): { series: Array<ProjectStatsSeries>; max: number } =>
	to_aligned_series(snapshot, monthly_counts_from_daily);

/**
 * Derives aligned weekly series for every project in `snapshot`, sharing one
 * time window and one scale — the weekly sibling of
 * `project_stats_to_monthly_series`.
 */
export const project_stats_to_weekly_series = (
	snapshot: ProjectStatsSnapshot
): { series: Array<ProjectStatsSeries>; max: number } =>
	to_aligned_series(snapshot, weekly_counts_from_daily);

const start_date_formatter = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC'
});

/**
 * Formats a one-line human-readable summary of a project's commit stats,
 * e.g. `"gro — 2,386 commits since August 7, 2019"`. Used for accessible
 * labels and tooltips.
 */
export const project_stats_label = (project: ProjectCommitStats): string => {
	let total = 0;
	for (const count of project.daily_counts) {
		total += count;
	}
	return `${project.name} — ${total.toLocaleString('en-US')} commits since ${start_date_formatter.format(new Date(project.start_date))}`;
};
