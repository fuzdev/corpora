<script lang="ts">
	import {
		category_color,
		cross_runtime_ratio_background,
		derive_cross_runtime_groups,
		derive_runtime_versions,
		derive_unavailable_by_runtime,
		format_cross_runtime_label,
		format_speedup,
		is_impl_unavailable,
		order_cross_runtime_runtimes,
		type BenchmarkRuntime,
		type CrossRuntimeReport
	} from './benchmark_data.ts';

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

	const format_ops = (n: number | undefined): string => (n == null ? 'fail' : n.toFixed(2));

	// An absent number reads as a load failure only when the report says so; every
	// other gap is a row that runtime never measured, which a mixed-vintage set
	// makes ordinary. Both render as `fail`, so the title carries the difference.
	const missing_cell_title = (name: string, runtime: BenchmarkRuntime): string =>
		is_impl_unavailable(report, runtime, name)
			? `${name} failed to load under ${runtime}, so it contributes no row there`
			: `${runtime}'s report carries no ${name} row — not measured there`;

	const group_label = (operation: string, language: string): string =>
		`${operation === 'format' ? 'Format' : 'Parse'} ${language}`;

	// the per-runtime timed counts in column order, for a row whose runtimes
	// timed different file sets (see `CrossRuntimeDisplayRow.files_iterated_mismatch`)
	const files_mismatch_label = (
		mismatch: Partial<Record<BenchmarkRuntime, number | null>>
	): string => runtimes.map((runtime) => mismatch[runtime] ?? '—').join('/');
</script>

<div class="cross-runtime">
	{#if report.mixed_vintage}
		<aside class="mixed-vintage">
			⚠ The per-runtime reports backing these tables come from different commits/versions, so the
			ratios are unreliable until every runtime is re-run.
		</aside>
	{/if}
	{#if report.mixed_machine}
		<aside class="mixed-vintage">
			⚠ The per-runtime reports backing these tables were produced on different hardware, so the
			ratios are not comparable until every runtime is re-run on one machine.
		</aside>
	{/if}
	{#if unavailable.length}
		<aside class="mixed-vintage">
			⚠ Some implementations don't load on every runtime:
			<ul class="unavailable">
				{#each unavailable as { runtime, rows } (runtime)}
					<li><code>{runtime}</code> — {rows.join(', ')}</li>
				{/each}
			</ul>
			These rows are unmeasured there, so a gap in those columns is a load failure rather than a
			speed result.
		</aside>
	{/if}
	{#if runtime_versions.length}
		<ul class="versions">
			{#each runtime_versions as { runtime, version } (runtime)}
				<li><code>{runtime}</code> {version}</li>
			{/each}
		</ul>
	{/if}
	{#each groups as group (group.group)}
		<div class="group">
			<h4 class="mt_0 mb_sm">{group_label(group.operation, group.language)}</h4>
			<table>
				<thead>
					<tr>
						<th></th>
						{#each runtimes as runtime (runtime)}
							<th class="num">{runtime}</th>
						{/each}
						{#each others as runtime (runtime)}
							<th class="num">{runtime}/{base}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each group.rows as row (row.name)}
						<tr>
							<td>
								<i class="swatch" style:background={category_color(row.category)}></i>
								{format_cross_runtime_label(row.name)}
								{#if row.files_iterated_mismatch}
									<small
										class="files-mismatch"
										title="the runtimes timed different file sets ({runtimes.join(
											'/'
										)}) — each runtime times the files its own binding accepted, so part of this row's ratio is file-set composition, not runtime"
									>
										⚠ files {files_mismatch_label(row.files_iterated_mismatch)}
									</small>
								{/if}
							</td>
							{#each runtimes as runtime (runtime)}
								{@const ops = row.ops_per_second[runtime]}
								<td class="num" title={ops == null ? missing_cell_title(row.name, runtime) : undefined}>
									{format_ops(ops)}
								</td>
							{/each}
							{#each others as runtime (runtime)}
								{@const ratio = row.ratio_vs_base[runtime]}
								<td
									class="num ratio"
									style:background={ratio != null
										? cross_runtime_ratio_background(ratio)
										: undefined}
								>
									{ratio != null ? format_speedup(ratio) : 'fail'}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}
	<p class="text_40">
		sweeps/sec — one sweep is a full pass over the group's timed file set (higher is faster); ratios
		are vs <code>{base}</code> (&gt; 1 = faster than {base}). A
		<code>fail</code> is a row that runtime contributed no number for — an implementation it can't
		load (listed above when the report records it), or one its report doesn't carry. The
		<code>native</code> rows load each runtime's idiomatic binding of the same engine — the N-API
		addon under <code>node</code> and <code>bun</code> (<code>tsv (node napi)</code>), the C-FFI
		library under <code>deno</code> (<code>tsv (deno ffi)</code>) — so the <code>deno</code> column
		is a first-class FFI-vs-N-API comparison, not a re-run of the same binding.
	</p>
</div>

<style>
	/* the warning red tint over fuz_css's base aside styling */
	.mixed-vintage {
		border-left-color: var(--color_c_50);
	}
	/* the per-runtime load failures inside the disclosure aside */
	.unavailable {
		margin-block: var(--space_xs);
	}
	/* the runtime versions the columns were measured under — a compact horizontal row */
	.versions {
		display: flex;
		flex-wrap: wrap;
		column-gap: var(--space_lg);
		row-gap: var(--space_xs);
		list-style: none;
		padding: 0;
		margin-bottom: var(--space_xl3);
		font-size: var(--font_size_sm);
		opacity: 0.7;
	}
	.group {
		margin-bottom: var(--space_xl4);
	}
	table {
		width: 100%;
	}
	.num {
		text-align: right;
	}
	.ratio {
		font-weight: 700;
	}
	td .swatch {
		display: inline-block;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		vertical-align: middle;
	}
	/* same warning tint as the mixed-vintage asides */
	.files-mismatch {
		margin-left: var(--space_xs);
		color: var(--color_c_50);
	}
</style>
