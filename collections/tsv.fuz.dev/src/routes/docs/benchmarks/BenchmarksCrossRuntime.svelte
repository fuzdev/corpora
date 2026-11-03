<script lang="ts">
	import {
		cross_runtime_ratio_background,
		derive_cross_runtime_groups,
		derive_runtime_versions,
		derive_unavailable_by_runtime,
		derive_unstable_cells,
		format_cross_runtime_label,
		is_cell_unstable,
		is_impl_unavailable,
		is_ratio_within_noise,
		order_cross_runtime_runtimes,
		type BenchmarkRuntime,
		type CrossRuntimeReport
	} from './benchmark_cross_runtime.ts';
	import {
		category_color,
		format_group_label,
		format_ns,
		format_speedup,
		format_unstable_readings
	} from './benchmark_display.ts';

	const {
		report
	}: {
		report: CrossRuntimeReport;
	} = $props();

	// The node/deno/bun versions the columns were measured under (node-first).
	const runtime_versions = $derived(derive_runtime_versions(report));

	// Node-first (the flagship N-API runtime), then deno, then bun — the same
	// display order `derive_cross_runtime_groups` anchors its ratios on.
	const runtimes = $derived(order_cross_runtime_runtimes(report.runtimes));
	const base = $derived(runtimes[0]);
	// ratio columns compare every other runtime against the base (node)
	const others = $derived(runtimes.filter((r) => r !== base));

	const groups = $derived(derive_cross_runtime_groups(report));

	// Which runtimes couldn't load which implementations — the difference between
	// a missing number that means "this binding is broken here" and one that means
	// "this runtime's report has no such row" (an older sibling, say).
	const unavailable = $derived(derive_unavailable_by_runtime(report));
	const unstable = $derived(derive_unstable_cells(report));

	// the `fail` legend is explained only while some cell renders one
	const has_fail = $derived(
		groups.some((g) => g.rows.some((row) => runtimes.some((r) => row.mean_ns[r] == null)))
	);

	// ms per sweep, as the per-runtime charts above print it
	const format_mean = (ns: number | undefined): string => {
		if (ns == null) return 'fail';
		const { value, unit } = format_ns(ns);
		return `${value} ${unit}`;
	};

	// An absent number reads as a load failure only when the report says so; every
	// other gap is a row that runtime never measured, which a mixed-vintage report set
	// makes ordinary. Both render as `fail`, so the title carries the difference.
	const missing_cell_title = (name: string, runtime: BenchmarkRuntime): string =>
		is_impl_unavailable(report, runtime, name)
			? `${name} failed to load under ${runtime}, so it contributes no row there`
			: `${runtime}'s report carries no ${name} row — not measured there`;
</script>

{#if report.mixed_machine}
	<aside class="benchmarks-warning">
		⚠ The per-runtime reports backing these tables were produced on different hardware, so the
		ratios are not comparable until every runtime is re-run on one machine.
	</aside>
{/if}
{#if unavailable.length}
	<aside class="benchmarks-warning">
		⚠ Some implementations don't load on every runtime:
		<ul class="warning-list">
			{#each unavailable as { runtime, rows } (runtime)}
				<li><code>{runtime}</code> — {rows.join(', ')}</li>
			{/each}
		</ul>
		These rows are unmeasured there, so a gap in those columns is a load failure rather than a speed
		result.
	</aside>
{/if}
{#if unstable.length}
	<aside class="benchmarks-warning">
		⚠ Some measurements were not stable, so every ratio through them is unreliable:
		<ul class="warning-list">
			{#each unstable as cell (cell.group + '/' + cell.name + '/' + cell.runtime)}
				<li>
					<code>{cell.runtime}</code> — {cell.group}/{cell.name}
					({format_unstable_readings(cell)})
				</li>
			{/each}
		</ul>
		Drift is a change in a row's cost while it was being measured (negative: still warming up;
		positive: degrading); pass spread is how far the row's passes, each a fresh process, sat apart.
		Each such cell is marked ⚠ below; read its ratio as unmeasured until that runtime is re-run.
	</aside>
{/if}
<p>
	Times are per sweep: one full pass over the group's timed file set, as in the charts above. Ratios
	are relative to <code>{base}</code>, negative when slower. The other tools' <code>native</code>
	rows are their npm N-API addons under all three runtimes.
	{#if has_fail}
		A <code>fail</code> means that runtime has no number for the row: either it can't load the
		implementation (listed above when the report records it), or its report doesn't carry the row.
	{/if}
</p>
<p>
	A <code>≈</code> marks a delta inside the two measurements' combined noise: read it as parity. The
	check has two limits. Each side's noise is the spread of a row's few passes, each a fresh process,
	which is a thin estimate, so an unmarked delta near it isn't necessarily an effect. And it can't
	see variance between whole runs.
</p>
{#if runtime_versions.length}
	<ul class="unstyled versions">
		{#each runtime_versions as { runtime, version } (runtime)}
			<li><code>{runtime}</code> {version}</li>
		{/each}
	</ul>
{/if}
{#each groups as group (group.group)}
	<div class="mb_xl5">
		<h3>{format_group_label(group.operation, group.language)}</h3>
		<div class="benchmarks-table-scroll">
			<table class="benchmarks-table">
				<thead>
					<tr>
						<th scope="col">implementation</th>
						{#each runtimes as runtime (runtime)}
							<th scope="col" class="benchmarks-num">{runtime}</th>
						{/each}
						{#each others as runtime (runtime)}
							<th scope="col" class="benchmarks-num">{runtime} vs {base}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each group.rows as row (row.name)}
						<tr>
							<th scope="row">
								<i class="swatch" aria-hidden="true" style:background={category_color(row.category)}
								></i>
								{format_cross_runtime_label(row.name)}
							</th>
							{#each runtimes as runtime (runtime)}
								{@const mean = row.mean_ns[runtime]}
								{@const cell_unstable = is_cell_unstable(report, group.group, row.name, runtime)}
								<td
									class="benchmarks-num"
									title={mean == null
										? missing_cell_title(row.name, runtime)
										: cell_unstable
											? 'this measurement was not stable — see the note above the tables'
											: undefined}
								>
									{format_mean(mean)}{cell_unstable ? ' ⚠' : ''}
								</td>
							{/each}
							{#each others as runtime (runtime)}
								{@const ratio = row.ratio_vs_base[runtime]}
								{@const within_noise =
									ratio != null &&
									base != null &&
									is_ratio_within_noise(report, group.group, row.name, base, runtime)}
								<td
									class="benchmarks-num ratio"
									class:within-noise={within_noise}
									title={within_noise
										? `this delta is smaller than the two measurements' combined noise, so read it as parity`
										: undefined}
									style:background={ratio != null && !within_noise
										? cross_runtime_ratio_background(ratio)
										: undefined}
								>
									{ratio != null ? `${within_noise ? '≈' : ''}${format_speedup(ratio)}` : 'fail'}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/each}

<style>
	/* the floor keeps a narrow screen scrolling rather than wrapping the row labels */
	table {
		min-width: 56rem;
	}
	tbody th {
		white-space: nowrap;
	}
	/* the lists inside the disclosure asides */
	.warning-list {
		margin-block: var(--space_xs);
	}
	/* the runtime versions the columns were measured under — a compact horizontal row */
	.versions {
		display: flex;
		flex-wrap: wrap;
		column-gap: var(--space_lg);
		row-gap: var(--space_xs);
		margin-bottom: var(--space_xl3);
	}
	.ratio {
		font-weight: 700;
	}
	/* a delta the report says is inside measurement noise reads as parity, not a result */
	.within-noise {
		font-weight: 400;
		opacity: 0.7;
	}
	th .swatch {
		display: inline-block;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		vertical-align: middle;
	}
</style>
