<script lang="ts">
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';

	import type { BenchmarkBaseline } from './benchmark_data.ts';
	import { format_commit, format_report_date, format_version_label } from './benchmark_display.ts';

	const {
		baseline,
		version_keys
	}: {
		baseline: BenchmarkBaseline;
		// narrows the versions list to these keys, for a page showing only some of
		// the report's tools
		version_keys?: ReadonlyArray<string>;
	} = $props();

	const site = site_context.get();

	// every tool version the report carries (or `version_keys` names), in report
	// order, so a tool added upstream appears without a site edit — tsv itself
	// renders under "run"
	const versions = $derived(
		Object.entries(baseline.versions).filter(
			([key]) => key !== 'tsv' && (!version_keys || version_keys.includes(key))
		)
	);

	const formatted_date = $derived(format_report_date(baseline.timestamp));

	// GitHub resolves abbreviated SHAs, so the short `git_commit` links directly.
	const commit_url = $derived(`${site.repo_url}/commit/${baseline.git_commit}`);
</script>

<div class="meta font_size_sm">
	<div>
		<h3 class="mt_0 mb_sm">versions</h3>
		<ul class="unstyled">
			{#each versions as [key, version] (key)}
				<li>{format_version_label(key)} {version}</li>
			{/each}
		</ul>
	</div>
	<div>
		<h3 class="mt_0 mb_sm">run</h3>
		<ul class="unstyled">
			<li>{formatted_date}</li>
			<li>tsv {baseline.versions.tsv}</li>
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={commit_url} rel="external">{format_commit(baseline.git_commit)}</a>
			</li>
		</ul>
	</div>
	<div>
		<h3 class="mt_0 mb_sm">environment</h3>
		<ul class="unstyled">
			<li>{baseline.machine.cpu_model}</li>
			<li>{baseline.machine.os}/{baseline.machine.arch}</li>
			<li>{baseline.runtime} {baseline.machine.runtime_version}</li>
		</ul>
	</div>
</div>

<style>
	/* labels for short lists of small print, not chart headings: an `h3` by rank
	 * under the section's `h2`, at the scale the lists can carry */
	h3 {
		--font_size: var(--font_size_lg);
		font-weight: 700;
	}
	.meta {
		display: flex;
		gap: var(--space_xl);
		flex-wrap: wrap;
	}
</style>
