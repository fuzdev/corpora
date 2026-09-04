<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';

	const {
		src,
		label,
		size,
		width,
		height,
		svg_attrs,
		img_attrs,
		...rest
	}: // the intersection makes rest shared attributes valid for whichever branch renders - // branch-specific attributes go in `svg_attrs`/`img_attrs`
		SvelteHTMLElements['img'] &
			SvelteHTMLElements['svg'] & {
				src: string;
				label?: string;
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
				svg_attrs?: SvelteHTMLElements['svg'];
				img_attrs?: SvelteHTMLElements['img'];
			} = $props();

	const final_width = $derived(width ?? size);
	const final_height = $derived(height ?? size);
</script>

{#if src.endsWith('.svg')}
	<svg
		role="img"
		{...rest}
		{...svg_attrs}
		aria-label={label ?? svg_attrs?.['aria-label'] ?? rest['aria-label']}
		style:width={final_width}
		style:height={final_height}
	>
		<image href={src} class="width:100% height:100%" />
	</svg>
{:else}
	<img
		{...rest}
		{...img_attrs}
		{src}
		alt={label ?? img_attrs?.alt ?? rest.alt}
		style:width={final_width}
		style:height={final_height}
	/>
{/if}
