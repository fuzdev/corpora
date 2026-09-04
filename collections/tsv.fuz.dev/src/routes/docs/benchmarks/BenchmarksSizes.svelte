<script lang="ts">
	import {
		format_bytes,
		format_gzip_size,
		derive_size_groups,
		type BaselineRow,
		type BinarySize
	} from './benchmark_data.ts';
	import BenchmarksBaselineGroup from './BenchmarksBaselineGroup.svelte';

	const {
		sizes
	}: {
		sizes: Array<BinarySize>;
	} = $props();

	// grouped by capability (full toolchain / formatter / parser) so each build
	// sits beside its closest competitor; wasm and native mix within a group
	const size_groups = $derived(derive_size_groups(sizes));

	// a disabled placeholder (e.g. oxfmt's absent wasm build) has no gzip size of its
	// own; when its group's other entries do carry one, fall back to 'n/a' rather than
	// omitting the annotation entirely - otherwise that row drops the annotation
	// column and its bar-track renders wider than its siblings'
	const has_gzip = (entries: ReadonlyArray<{ gzip_bytes: number | null }>) =>
		entries.some((e) => e.gzip_bytes != null);

	const to_rows = (group: (typeof size_groups)[number]): Array<BaselineRow> => {
		const group_has_gzip = has_gzip(group.entries);
		return group.entries.map((s) => ({
			key: s.label,
			label: s.label,
			category: s.category,
			bar_fraction: s.bar_fraction,
			value: format_bytes(s.bytes),
			raw: s.bytes,
			annotation: s.disabled
				? group_has_gzip
					? 'n/a'
					: undefined
				: format_gzip_size(s.gzip_bytes),
			disabled: s.disabled ?? false
		}));
	};
</script>

{#each size_groups as group (group.capability)}
	<div class="size-group">
		<h3>{group.heading}</h3>
		<BenchmarksBaselineGroup rows={to_rows(group)} direction="size" />
	</div>
{/each}

<style>
	.size-group {
		margin-bottom: var(--space_lg);
	}
</style>
