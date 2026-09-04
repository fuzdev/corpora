<script lang="ts">
	import type { OmitStrict } from '@fuzdev/fuz_util/types.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { project_items } from './projects.ts';
	import { project_stats_data } from './project_stats_data.ts';
	import { project_stats_label, project_stats_to_weekly_series } from './project_stats.ts';
	import { sparkline_geometry, type SparklineScale } from './sparkline.ts';

	/**
	 * A large line chart of weekly commit activity with every fuz.dev project
	 * drawn over one another, sharing one time window and one scale.
	 *
	 * Each project's line uses its `color_class` from `project_items` (the
	 * `ProjectLinks` grid doubles as the legend), with the same per-point alpha
	 * fade and end dot as `Sparkline`. Hovering a line shows the project's
	 * stats via a native `title`. The svg scales to its container's width.
	 *
	 * The background is a light wash of `currentColor` (the inherited text
	 * color), overridable with the `--sparkline_bg` custom property.
	 *
	 * @module
	 */

	const {
		width = 800,
		height = 160,
		scale = 1 / 3,
		stroke_width = 2,
		alpha_floor = 0.4,
		label = 'weekly commit activity for all projects, drawn over one another at a shared scale',
		...rest
	}: OmitStrict<SvelteHTMLElements['svg'], 'width' | 'height' | 'scale'> & {
		/**
		 * Width of the svg's coordinate space in px; rendering stretches to the container.
		 */
		width?: number;
		/**
		 * Height of the svg's coordinate space in px.
		 */
		height?: number;
		/**
		 * Vertical scale for the lines' geometry — see `SparklineScale`.
		 */
		scale?: SparklineScale;
		stroke_width?: number;
		/**
		 * Stroke alpha at a value of 0, scaling linearly to 1 at the shared max.
		 */
		alpha_floor?: number;
		/**
		 * Accessible label for the chart.
		 */
		label?: string;
	} = $props();

	const chart_id = $props.id();

	const { series, max } = project_stats_to_weekly_series(project_stats_data);
	const color_class_by_name = new Map(project_items.map((p) => [p.name, p.color_class]));
	const label_by_name = new Map(
		project_stats_data.projects.map((p) => [p.name, project_stats_label(p)])
	);

	const lines = $derived(
		series.flatMap(({ name, counts }) => {
			const geometry = sparkline_geometry(counts, {
				width,
				height,
				max,
				scale,
				stroke_width,
				alpha_floor,
				end_dot: true
			});
			return geometry
				? [
						{
							name,
							geometry,
							color_class: color_class_by_name.get(name),
							title: label_by_name.get(name)
						}
					]
				: [];
		})
	);
</script>

<svg {...rest} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
	<defs>
		{#each lines as line, index (line.name)}
			<linearGradient
				id="{chart_id}-{index}"
				class={line.color_class}
				gradientUnits="userSpaceOnUse"
				x1="0"
				y1="0"
				x2={width}
				y2="0"
			>
				{#each line.geometry.stops as stop, stop_index (stop_index)}
					<stop offset={stop.offset} stop-color="currentColor" stop-opacity={stop.opacity} />
				{/each}
			</linearGradient>
		{/each}
	</defs>
	{#each lines as line, index (line.name)}
		<g class={line.color_class}>
			<title>{line.title}</title>
			<polyline
				points={line.geometry.points}
				fill="none"
				stroke="url(#{chart_id}-{index})"
				stroke-width={stroke_width}
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
			<circle
				cx={line.geometry.end_x}
				cy={line.geometry.end_y}
				r={line.geometry.dot_radius}
				fill="currentColor"
				fill-opacity={line.geometry.end_alpha}
			/>
		</g>
	{/each}
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		background: var(--sparkline_bg, color-mix(in hsl, currentColor 8%, transparent));
		border-radius: var(--border_radius_xs);
	}
</style>
