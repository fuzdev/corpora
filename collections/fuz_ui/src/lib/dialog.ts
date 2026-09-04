import { create_context } from './context_helpers.ts';

export type DialogAlign = 'center' | 'top';
export const dialog_aligns: Array<DialogAlign> = ['center', 'top'];

/**
 * Set by `Dialog`, read by `DialogContent`. Lets the content surface close the
 * dialog without the consumer threading `close` through the `children` snippet.
 */
export interface DialogContext {
	/**
	 * Closes the dialog. When passed an event it's swallowed (default-prevented
	 * and propagation-stopped) before closing.
	 */
	close: (e?: Event) => void;
	/**
	 * Registers a content-surface element so a press inside it isn't treated as an
	 * outside-dismiss. The surface is known by node identity, independent of any
	 * class. Use as an attachment on the surface: `{@attach register_surface}`.
	 * Returns a cleanup that unregisters on unmount.
	 */
	register_surface: (element: Element) => () => void;
}

export const dialog_context = create_context<DialogContext>();

/**
 * The `attrs` a custom `DialogContent` `close_button` snippet receives.
 * Spread onto a `<button>` to inherit the corner-anchored close button.
 */
export interface DialogCloseButtonAttrs {
	type: 'button';
	class: string;
	style: string;
	onclick: DialogContext['close'];
	title: string;
	'aria-label': string;
}
