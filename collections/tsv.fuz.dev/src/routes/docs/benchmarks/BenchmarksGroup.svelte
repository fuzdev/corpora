<script lang="ts">
	import type { BaselineRow } from './benchmark_baseline.ts';
	import type { BenchmarkGroup } from './benchmark_data.ts';
	import {
		format_count_maybe,
		format_group_label,
		format_group_omissions,
		format_language,
		format_ns,
		format_untimed_reason
	} from './benchmark_display.ts';
	import BenchmarksBaselineGroup from './BenchmarksBaselineGroup.svelte';

	const {
		group
	}: {
		group: BenchmarkGroup;
	} = $props();

	// the count of files actually benchmarked, every row's shared timed set
	const count_label = $derived(format_count_maybe(group.files_iterated));

	const rows: Array<BaselineRow> = $derived(
		group.entries.map((e) => ({
			key: e.name,
			label: e.name,
			category: e.category,
			bar_fraction: e.bar_fraction,
			// the whole-sweep mean — total time to process the group's iterated corpus
			// once, which is also what the ratios derive from via `raw`
			value: format_ns(e.mean_ns),
			raw: e.mean_ns,
			annotation: undefined,
			disabled: e.disabled ?? false,
			placeholder: e.coverage_only ? format_untimed_reason(e.name) : undefined
		}))
	);
</script>

<div class="mb_xl5">
	<h3>
		{group.operation === 'format' ? 'Formatting' : 'Parsing'}
		{count_label}
		{format_language(group.language)} files
	</h3>
	<BenchmarksBaselineGroup {rows} label={format_group_label(group.operation, group.language)} />
	{#if group.omissions}
		<p><small>{format_group_omissions(group.omissions)}</small></p>
	{/if}
</div>
