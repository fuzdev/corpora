<script lang="ts">
	import Svg from './Svg.svelte';
	import Sparkline from './Sparkline.svelte';
	import { project_items, type ProjectItem } from './projects.ts';
	import { project_stats_data } from './project_stats_data.ts';
	import { project_stats_label, project_stats_to_monthly_series } from './project_stats.ts';

	const { series, max } = project_stats_to_monthly_series(project_stats_data);
	const series_by_name = new Map(series.map((s) => [s.name, s.counts]));
	const label_by_name = new Map(
		project_stats_data.projects.map((p) => [p.name, project_stats_label(p)])
	);
</script>

<h2 class="mt_0 mb_xl2">Packages</h2>
<menu class="unstyled font_size_lg">
	{#each project_items as project_item (project_item.name)}
		{@render package_thumbnail(project_item)}
	{/each}
</menu>
<small class="display:block text-align:right">
	the charts show public commit activity<br />since Gro started in August 2019 -<br />most of the
	repos created in 2023-2024 are<br />history-resetting forks from 2020~2023 attempts
</small>

{#snippet package_thumbnail(project_item: ProjectItem)}
	{@const counts = series_by_name.get(project_item.name)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		class="thumbnail row align-items:start shade_00 px_md py_xs border_radius_sm mb_lg"
		href={project_item.url}
	>
		<Svg shrink={false} data={project_item.logo} size="var(--icon_size_lg)" />
		<div class="pl_lg width_atmost_sm">
			<div class="thumbnail-name row {project_item.color_class}">
				{project_item.name}
				{#if counts}
					{@const stats_label = label_by_name.get(project_item.name)}
					<div class="thumbnail-sparkline pl_md {project_item.color_class}" title={stats_label}>
						<Sparkline values={counts} {max} scale={1 / 3} end_dot label={stats_label} />
					</div>
				{/if}
			</div>
			<div class="thumbnail-description font_size_md text_70 font-weight:500">
				{project_item.description}
				{project_item.glyph}
			</div>
		</div>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

<style>
	.thumbnail {
		box-shadow: var(--shadow_bottom_xs)
			color-mix(
				in hsl,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_30),
				transparent
			);
	}
	.thumbnail:hover {
		box-shadow: var(--shadow_bottom_sm)
			color-mix(
				in hsl,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_30),
				transparent
			);

		/* show the underline only on the name, not the description */
		text-decoration: none;
		.thumbnail-name {
			text-decoration: underline;
		}
		.thumbnail-description {
			text-decoration: none;
		}
	}
	.thumbnail:active {
		box-shadow: var(--shadow_top_xs)
			color-mix(
				in hsl,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_30),
				transparent
			);
	}
	.thumbnail-sparkline {
		margin-left: auto;
	}
</style>
