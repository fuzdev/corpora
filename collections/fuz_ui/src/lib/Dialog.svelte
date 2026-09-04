<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { SvelteSet } from 'svelte/reactivity';
	import { swallow } from '@fuzdev/fuz_util/dom.ts';

	import { dialog_context, type DialogContext, type DialogAlign } from './dialog.ts';

	/**
	 * This component renders a native `<dialog>` opened with `showModal()`, which
	 * puts it in the top layer. The top layer escapes ancestor stacking/overflow
	 * contexts (so no `Teleport` is needed), traps focus, makes the rest of the page
	 * inert, closes on Escape, and restores focus to the previously focused element
	 * on close -- all natively. The dim background is the native `::backdrop`.
	 *
	 * We render a full-viewport overlay inside the dialog rather than a content-sized
	 * box, to preserve the scrolling and `align="top"` behaviors. The content
	 * surface itself is the consumer's -- pair this with `DialogContent` for the
	 * default `.pane` card and gutter, or render your own surface in `children`.
	 *
	 * @module
	 */

	const {
		show = true,
		align = 'center',
		dismissable = true,
		content_selector = '.pane',
		onbeforeclose,
		onclose,
		children,
		...rest
	}: Omit<SvelteHTMLElements['dialog'], 'children' | 'onclose'> & {
		/**
		 * Whether the dialog is shown. When the `<dialog>` mounts it opens via
		 * `showModal()`; when it unmounts it closes.
		 * Defaults to `true` so the `{#if opened}<Dialog>...</Dialog>{/if}` pattern
		 * works without passing `show` -- mounting the component opens the dialog.
		 * Pass `show={opened}` to skip the outer `{#if}` and let the component manage
		 * its own conditional rendering.
		 * @default true
		 */
		show?: boolean;
		/**
		 * How the content is aligned in the viewport. `center` vertically centers it;
		 * `top` aligns it to the top and grows downward, which avoids jank when the
		 * content's height changes.
		 * @default 'center'
		 */
		align?: DialogAlign;
		/**
		 * Whether clicking outside the content (see `content_selector`) closes the
		 * dialog. `Escape` closes it regardless of this.
		 * @default true
		 */
		dismissable?: boolean;
		/**
		 * Fallback selector for a content surface you render in `children` yourself
		 * (rather than via `DialogContent`, which self-registers).
		 * When `dismissable`, a press that isn't inside a registered surface (e.g.
		 * `DialogContent`, which self-registers) and doesn't match this selector
		 * closes the dialog. Defaults to the fuz_css `.pane` card; set it to match
		 * your surface's outermost element -- with no registered surface and no
		 * match, presses anywhere close the dialog.
		 * @default '.pane'
		 */
		content_selector?: string;
		/**
		 * Called before a user-initiated close (`Escape`, click-outside, or `close`).
		 * Return `false` to veto and keep the dialog open -- e.g. to confirm
		 * discarding unsaved changes. Programmatic close via `show={false}` bypasses
		 * this.
		 */
		onbeforeclose?: () => boolean | void;
		/**
		 * Called when the dialog closes -- via `Escape`, click-outside, or `close`.
		 * Use it to sync your own open state, e.g. `onclose={() => (opened = false)}`.
		 * Like `onbeforeclose`, programmatic close via `show={false}` bypasses this.
		 */
		onclose?: () => void;
		/**
		 * Rendered inside the dialog overlay. Receives the `DialogContext` (e.g.
		 * `{close}`); pair with `DialogContent` or render your own surface.
		 */
		children: Snippet<[dialog: DialogContext]>;
	} = $props();

	let dialog_el: HTMLDialogElement | undefined;

	// Guards against a single dismissal firing `onclose` twice. Reset on mount.
	let closing = false;

	// Closes the native dialog (which restores focus to the trigger) and notifies
	// the consumer to unmount us. Closing here, while still mounted and connected,
	// is what makes focus restoration work -- closing on unmount would run on a
	// detached node, which doesn't restore focus.
	const request_close = () => {
		if (closing) return;
		// let the consumer veto a user-initiated dismissal (e.g. confirm unsaved changes)
		if (onbeforeclose?.() === false) return;
		closing = true;
		dialog_el?.close();
		onclose?.();
	};

	// The `close` passed to children also swallows the triggering event.
	const close = (e?: Event) => {
		if (e) swallow(e);
		request_close();
	};

	// Content surfaces (e.g. `DialogContent`) register here so a press inside one
	// isn't an outside-dismiss. Identity-based, so it works regardless of classes;
	// `content_selector` stays the fallback for surfaces rendered in `children`.
	const surfaces = new SvelteSet<Element>();
	const register_surface = (element: Element): (() => void) => {
		surfaces.add(element);
		return () => {
			surfaces.delete(element);
		};
	};

	// The context is both passed to `children` and set for descendants (e.g.
	// `DialogContent`), so either path can close the dialog.
	const context: DialogContext = { close, register_surface };
	dialog_context.set(context);

	const setup_dialog = (el: HTMLDialogElement) => {
		dialog_el = el;
		closing = false;
		// Esc (and any platform close request) fires `cancel`. We swallow it and
		// close the dialog ourselves (above, while connected) so focus is restored,
		// and so the consumer's state stays in sync and we unmount.
		const oncancel = (e: Event) => {
			swallow(e);
			request_close();
		};
		el.addEventListener('cancel', oncancel);
		if (!el.open) el.showModal();
		return () => {
			el.removeEventListener('cancel', oncancel);
			dialog_el = undefined;
			// fallback for programmatic unmount (e.g. `show` set false directly)
			if (el.open) el.close();
		};
	};
</script>

{#if show}
	<dialog
		{...rest}
		class={['dialog', rest.class, { 'align-top': align === 'top' }]}
		{@attach setup_dialog}
	>
		<div
			class="dialog-wrapper"
			role="none"
			onmousedown={(e) => {
				if (!dismissable) return;
				const target = e.target as Element;
				// inside a registered surface (e.g. DialogContent) -> not an outside dismiss
				for (const surface of surfaces) {
					if (surface.contains(target)) return;
				}
				// fallback for surfaces rendered in `children`: match `content_selector`
				if (content_selector && target.closest(content_selector)) return;
				close(e);
			}}
		>
			{@render children(context)}
		</div>
	</dialog>
{/if}

<style>
	.dialog {
		--pane_shadow: var(--shadow_bottom_xl)
			color-mix(
				in hsl,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_70),
				transparent
			);
		/* reset the user-agent dialog styles; we render a full-viewport overlay */
		max-width: none;
		max-height: none;
		/* width/height are needed despite `inset: 0` to make the dialog element fill the viewport */
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		position: fixed;
		inset: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}
	/* the native backdrop is the dim background; fade it in on open */
	.dialog::backdrop {
		background-color: var(--dialog_bg, var(--darken_60));
		transition: background-color var(--duration_2) ease;
	}
	@starting-style {
		.dialog::backdrop {
			background-color: transparent;
		}
	}

	/* Lock background scroll while a modal dialog is open. `scrollbar-gutter`
	reserves the scrollbar space so toggling the lock doesn't shift the layout. */
	:global(html:has(dialog.dialog[open])) {
		overflow: hidden;
		scrollbar-gutter: stable;
	}

	/* `min-height: 100%` (not `height`) makes tall content overflow downward only: the
	wrapper grows to its content, so the centered top stays reachable in the dialog's
	scroll. A fixed-height centering box would strand the top above the scroll origin. */
	.dialog-wrapper {
		min-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.align-top .dialog-wrapper {
		align-items: start;
	}
</style>
