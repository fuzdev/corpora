<script lang="ts">
	import { ensure_end } from '@fuzdev/fuz_util/string.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import type { SvgData } from './svg.ts';

	/**
	 * Renders an `SvgData` icon definition to inline `svg` markup, never via `@html`.
	 *
	 * ## Security
	 *
	 * `SvgData` is rendered structurally into a fixed element set - `svg`, `defs`,
	 * `linearGradient`/`radialGradient`, `stop`, and `path`. None of these expose a
	 * navigation or script sink (no `src` or `foreignObject`, and a gradient `href`
	 * only references another gradient as a template, never a document location),
	 * and Svelte routes `on*` spread keys through `addEventListener` rather than
	 * writing inline handler attributes. So even an untrusted `SvgData` cannot
	 * introduce script execution or navigation - which is why the data is rendered
	 * through typed fields (`paths`, `gradients`) instead of a raw-markup escape
	 * hatch.
	 *
	 * The one residual: a `style` value (`data.style`, a path's `style`, or a
	 * gradient's `attrs.style`) can still issue network requests via `url(...)`, so
	 * sanitize styles if you render untrusted data and that matters. Per-instance
	 * `svg` attributes come from this component's own props, not from `data`.
	 *
	 * @module
	 */

	const {
		data,
		fill,
		size = 'var(--font_size, auto)',
		width,
		height,
		label,
		inline,
		shrink = true,
		...rest
	}: SvelteHTMLElements['svg'] & {
		data: SvgData;
		/**
		 * Overrides `data.fill`.
		 */
		fill?: string | null;
		/**
		 * Sets both the `width` and `height` of the svg. Overridden by the `width` and `height` props.
		 */
		size?: string;
		/**
		 * Sets the `width` of the svg. Overrides `size`.
		 */
		width?: string;
		/**
		 * Sets the `height` of the svg. Overrides `size`.
		 */
		height?: string;
		label?: string;
		/**
		 * Renders the SVG as an inline block with spacing appropriate for text. Defaults to `false`.
		 */
		inline?: boolean;
		shrink?: boolean;
	} = $props();

	const final_fill = $derived(fill ?? data.fill ?? 'var(--text_color, #000)'); // can be overridden by each path's `fill` attribute
	const final_width = $derived(width ?? size); // TODO @many default value? `100%` or omitted or something else?
	const final_height = $derived(height ?? size); // TODO @many default value? `100%` or omitted or something else?

	// merge `style` so the icon's own style and a per-instance `style` prop don't clobber each other
	const style = $derived(
		data.style && rest.style
			? ensure_end(data.style, ';') + ' ' + rest.style
			: (data.style ?? rest.style)
	);
</script>

<svg
	viewBox={data.viewBox ?? '0 0 100 100'}
	{...rest}
	aria-label={label ?? data.label ?? rest['aria-label']}
	class={[rest.class, { inline }]}
	style:width={final_width}
	style:height={final_height}
	style:flex-shrink={shrink ? 1 : 0}
	{style}
>
	{#if data.gradients}
		<defs>
			{#each data.gradients as gradient (gradient.id)}
				{#if gradient.type === 'radial'}
					<radialGradient id={gradient.id} {...gradient.attrs}>
						{#each gradient.stops as stop (stop)}
							<stop offset={stop.offset} stop-color={stop.color} stop-opacity={stop.opacity} />
						{/each}
					</radialGradient>
				{:else}
					<linearGradient id={gradient.id} {...gradient.attrs}>
						{#each gradient.stops as stop (stop)}
							<stop offset={stop.offset} stop-color={stop.color} stop-opacity={stop.opacity} />
						{/each}
					</linearGradient>
				{/if}
			{/each}
		</defs>
	{/if}
	{#if data.paths}
		{#each data.paths as path (path)}
			<path fill={final_fill} {...path} />
		{/each}
	{/if}
</svg>

<style>
	.inline {
		display: inline-block;
		position: relative;
		vertical-align: middle;
	}
</style>
