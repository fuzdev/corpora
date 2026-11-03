/**
 * Svelte 5 attachment that focuses an element on mount.
 *
 * @module
 */

import type { Attachment } from 'svelte/attachments';

/**
 * Creates an attachment that focuses the element on mount.
 * Use this instead of the HTML `autofocus` attribute for elements
 * that mount dynamically from reactive conditionals like `{#if}`.
 * @param options - focus options forwarded to `element.focus()`; defaults to `{focusVisible: true}` to show focus indicators on programmatic focus
 */
export const autofocus =
	(options?: FocusOptions): Attachment<HTMLElement | SVGElement> =>
	(el) => {
		el.focus({ focusVisible: true, ...options });
	};
