<script lang="ts">
	import type { OmitStrict } from '@fuzdev/fuz_util/types.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { sparkline_geometry, type SparklineScale } from './sparkline.ts';

	/**
	 * Renders values as a small inline SVG line graph.
	 *
	 * Designed for comparable small multiples: pass a shared `max` so a set of
	 * sparklines renders at the same vertical scale instead of each stretching
	 * to fit. The stroke uses `currentColor`, so color it by setting `color` on
	 * the component or a parent (e.g. a fuz_css `color_*` class). Each point's
	 * stroke alpha scales with its value, from `alpha_floor` at 0 up to 1 at
	 * `max`, de-emphasizing quiet stretches.
	 *
	 * `scale` controls only the geometry: the nonlinear options compress the
	 * top of the range so small values stay legible under a large shared
	 * `max`, while the alpha fade keeps tracking the linear ratio so it still
	 * encodes true magnitude.
	 *
	 * The background is a light wash of `currentColor`, overridable with the
	 * `--sparkline_bg` custom property.
	 *
	 * @module
	 */

	const {
		values,
		max,
		scale = 'linear',
		width = 100,
		height = 24,
		stroke_width = 2,
		alpha_floor = 0.4,
		end_dot = false,
		label,
		...rest
	}: OmitStrict<SvelteHTMLElements['svg'], 'values' | 'width' | 'height' | 'scale'> & {
		values: Array<number>;
		/**
		 * The value rendered at full height and full alpha.
		 * Pass a shared max across sparklines for comparable scales.
		 * Defaults to the local max of `values`.
		 */
		max?: number;
		/**
		 * Vertical scale for the line's geometry — see `SparklineScale`.
		 * The alpha fade always tracks the linear ratio regardless of `scale`.
		 */
		scale?: SparklineScale;
		/**
		 * Width of the svg in px.
		 */
		width?: number;
		/**
		 * Height of the svg in px.
		 */
		height?: number;
		stroke_width?: number;
		/**
		 * Stroke alpha at a value of 0, scaling linearly to 1 at `max`.
		 */
		alpha_floor?: number;
		/**
		 * Renders a dot at the final point, anchoring the "now" end of the line.
		 */
		end_dot?: boolean;
		/**
		 * Accessible label. When omitted the svg is `aria-hidden`.
		 */
		label?: string;
	} = $props();

	const gradient_id = $props.id();

	const geometry = $derived(
		sparkline_geometry(values, { width, height, max, scale, stroke_width, alpha_floor, end_dot })
	);
</script>

<svg
	{...rest}
	{width}
	{height}
	viewBox="0 0 {width} {height}"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : true}
>
	{#if geometry}
		<defs>
			<linearGradient
				id={gradient_id}
				gradientUnits="userSpaceOnUse"
				x1="0"
				y1="0"
				x2={width}
				y2="0"
			>
				{#each geometry.stops as stop, index (index)}
					<stop offset={stop.offset} stop-color="currentColor" stop-opacity={stop.opacity} />
				{/each}
			</linearGradient>
		</defs>
		<polyline
			points={geometry.points}
			fill="none"
			stroke="url(#{gradient_id})"
			stroke-width={stroke_width}
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
		{#if end_dot}
			<circle
				cx={geometry.end_x}
				cy={geometry.end_y}
				r={geometry.dot_radius}
				fill="currentColor"
				fill-opacity={geometry.end_alpha}
			/>
		{/if}
	{/if}
</svg>

<style>
	svg {
		background: var(--sparkline_bg, color-mix(in hsl, currentColor 8%, transparent));
		border-radius: var(--border_radius_xs);
	}
</style>
