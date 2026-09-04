import type { SvelteHTMLElements } from 'svelte/elements';

/**
 * A structured icon definition rendered by `Svg.svelte`. Rendering is purely
 * structural - typed fields, never raw markup - so untrusted data cannot
 * introduce script execution or navigation. See `Svg.svelte` for the full
 * security notes, including the residual `style` `url(...)` caveat.
 */
export interface SvgData {
	/**
	 * List of svg `path` attribute objects, spread onto each `path` element. The
	 * `d` attribute is required; a per-path `fill` overrides the resolved `fill`.
	 */
	paths?: Array<{ d: string } & SvelteHTMLElements['path']> | null;
	/**
	 * Inline `style` applied to the root `svg` element, merged with any `style`
	 * passed as a component prop. Travels with the icon definition - per-instance
	 * svg attributes belong on the `Svg` component itself.
	 */
	style?: string | null;
	/**
	 * Default `fill` for every `path`, falling back to `var(--text_color, #000)`.
	 * Overridden by the component's `fill` prop, and per-path by a path's own `fill`.
	 */
	fill?: string | null;
	/**
	 * Accessible name, applied as `aria-label`. Overridden by the component's `label` prop.
	 */
	label?: string | null;
	/**
	 * Defaults to `"0 0 100 100"`.
	 */
	viewBox?: string | null;
	/**
	 * Gradient definitions rendered into the svg's `<defs>` block. This is the
	 * structured replacement for raw markup - reference a gradient from a
	 * path/shape `fill` or `stroke` with `url(#id)`. Most svgs need only `paths`.
	 */
	gradients?: Array<SvgGradient> | null;
}

/**
 * A gradient definition rendered into the svg's `<defs>` block. Reference it
 * from a path/shape `fill` or `stroke` with `url(#id)`.
 */
export interface SvgGradient {
	/**
	 * Whether to render a `linearGradient` or `radialGradient` element.
	 */
	type: 'linear' | 'radial';
	/**
	 * The `id` referenced by a `fill`/`stroke` like `url(#id)`. Inline svgs share
	 * the document's id namespace, so pick a value unique to the icon - icons
	 * with colliding ids all resolve to whichever element renders first.
	 */
	id: string;
	/**
	 * The gradient's color stops.
	 */
	stops: Array<SvgGradientStop>;
	/**
	 * Additional attributes on the gradient element, e.g. `gradientUnits`,
	 * `gradientTransform`, `cx`/`cy`/`r` (radial), or `x1`/`y1`/`x2`/`y2` (linear).
	 */
	attrs?: (SvelteHTMLElements['radialGradient'] & SvelteHTMLElements['linearGradient']) | null;
}

/**
 * A single color stop of an `SvgGradient`.
 */
export interface SvgGradientStop {
	/**
	 * The stop's position along the gradient, e.g. `0.5` or `"50%"`.
	 */
	offset: string | number;
	/**
	 * The stop's color, applied as the `stop-color` attribute.
	 */
	color: string;
	/**
	 * The stop's opacity, applied as the `stop-opacity` attribute.
	 */
	opacity?: string | number | null;
}
