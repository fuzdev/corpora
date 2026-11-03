<script lang="ts">
	import Svg from './Svg.svelte';
	import { project_items, type ProjectItem } from './projects.ts';
</script>

<h2 class="mt_0 mb_xl2">Packages</h2>
<menu class="unstyled font_size_lg">
	{#each project_items as project_item (project_item.name)}
		{@render package_thumbnail(project_item)}
	{/each}
</menu>

{#snippet package_thumbnail(project_item: ProjectItem)}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="thumbnail row shade_00 px_md py_xs border_radius_sm mb_lg" href={project_item.url}>
		<Svg shrink={false} data={project_item.logo} size="var(--icon_size_lg)" />
		<div class="pl_lg width_atmost_sm">
			<div class="thumbnail-name {project_item.color_class}">{project_item.name}</div>
			<div class="thumbnail-description font_size_md text_70 font-weight:500">
				{project_item.description}
				{project_item.glyph}
			</div>
		</div>
	</a>
{/snippet}

<style>
	.thumbnail {
		box-shadow: var(--shadow_bottom_xs)
			color-mix(
				in oklab,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_30),
				transparent
			);
	}
	.thumbnail:hover {
		box-shadow: var(--shadow_bottom_sm)
			color-mix(
				in oklab,
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
				in oklab,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_30),
				transparent
			);
	}
</style>
