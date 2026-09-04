<script module lang="ts">
	// The default entry snippets are shared by `ContextmenuRoot.svelte`
	// and `ContextmenuRootForSafariCompatibility.svelte`.
	export { link_entry_default, text_entry_default, separator_entry_default };
</script>

<script lang="ts">
	/**
	 * The menu surface shared by `ContextmenuRoot.svelte` and
	 * `ContextmenuRootForSafariCompatibility.svelte`. Owns everything that happens
	 * while the menu is open - positioning, keyboard navigation, dismissal on
	 * outside presses, popover top-layer promotion, and entry rendering - while
	 * the roots own gesture detection, i.e. how the menu opens. Holds no gesture
	 * state of its own; the `open_guard` it consults is owned and armed by the root.
	 */
	import { swallow } from '@fuzdev/fuz_util/dom.ts';
	import type { ComponentProps, Snippet } from 'svelte';

	import {
		contextmenu_dimensions_context,
		type ContextmenuState
	} from './contextmenu_state.svelte.ts';
	import ContextmenuLinkEntry from './ContextmenuLinkEntry.svelte';
	import ContextmenuTextEntry from './ContextmenuTextEntry.svelte';
	import ContextmenuSeparator from './ContextmenuSeparator.svelte';
	import {
		contextmenu_create_keyboard_handlers,
		contextmenu_create_keydown_handler,
		contextmenu_create_mousedown_handler,
		contextmenu_calculate_constrained_x,
		contextmenu_calculate_constrained_y,
		contextmenu_popover_attachment,
		type ContextmenuOpenGuard
	} from './contextmenu_helpers.ts';

	let {
		contextmenu,
		open_guard,
		link_entry,
		text_entry,
		separator_entry,
		el = $bindable()
	}: {
		/**
		 * The contextmenu state owned by the root.
		 */
		contextmenu: ContextmenuState;
		/**
		 * Guards the menu from the residual events of the gesture that opened it.
		 * Owned by the root, which arms it when its gesture detection opens the menu.
		 */
		open_guard: ContextmenuOpenGuard;
		/**
		 * Snippet for rendering link entries, or `null` to disable them.
		 */
		link_entry: Snippet<[ComponentProps<typeof ContextmenuLinkEntry>]> | null;
		/**
		 * Snippet for rendering copy text entries, or `null` to disable them.
		 */
		text_entry: Snippet<[ComponentProps<typeof ContextmenuTextEntry>]> | null;
		/**
		 * Snippet for rendering separator entries, or `null` to disable them.
		 */
		separator_entry: Snippet<[ComponentProps<typeof ContextmenuSeparator>]> | null;
		/**
		 * The menu element while opened - bound by the roots for their gesture handlers.
		 */
		el?: HTMLElement;
	} = $props();

	const { layout } = $derived(contextmenu);

	const dimensions = contextmenu_dimensions_context.set();

	const x = $derived(
		contextmenu_calculate_constrained_x(contextmenu.x, dimensions.width, layout.width)
	);
	const y = $derived(
		contextmenu_calculate_constrained_y(contextmenu.y, dimensions.height, layout.height)
	);

	// Closes the contextmenu on presses outside of it.
	const mousedown = $derived(
		contextmenu_create_mousedown_handler(contextmenu, () => el, open_guard)
	);

	const keyboard_handlers = $derived(contextmenu_create_keyboard_handlers(contextmenu));
	const keydown = $derived(contextmenu_create_keydown_handler(keyboard_handlers));
</script>

<svelte:window
	onmousedown={!contextmenu.opened ? undefined : mousedown}
	onkeydown={!contextmenu.opened ? undefined : keydown}
	onmouseupcapture={(e) => open_guard.track_mouseup(e)}
/>

{#if !contextmenu.has_custom_layout}
	<div
		class="contextmenu-layout"
		bind:clientWidth={layout.width}
		bind:clientHeight={layout.height}
		aria-hidden="true"
	></div>
{/if}

<!-- TODO animate the contextmenu as it appears somehow, maybe a subtle highlight -->
<!-- TODO implement focus management per APG: store `document.activeElement` when opening, focus menu on mount, restore focus on close if element `isConnected` -->
{#if contextmenu.opened}
	<!-- Keyed on `params` (a fresh array every open) so reopening while open - which swaps
	`params` without toggling `opened` - remounts the menu: entries register fresh state and
	the popover attachment re-resolves its host (e.g. a modal dialog opened since the first
	open). -->
	{#key contextmenu.params}
		<ul
			class="contextmenu unstyled pane"
			role="menu"
			aria-label="context menu"
			tabindex="-1"
			popover="manual"
			{@attach contextmenu_popover_attachment(contextmenu)}
			bind:this={el}
			bind:offsetWidth={dimensions.width}
			bind:offsetHeight={dimensions.height}
			style:transform="translate3d({x}px, {y}px, 0)"
			onclickcapture={(e) => {
				// blocks a click synthesized from the touch gesture that opened the menu,
				// which would activate the first item (iOS can synthesize it even when
				// the release was swallowed)
				if (open_guard.consume_blocked_click()) swallow(e);
			}}
		>
			<!-- TODO maybe this should be generic? -->
			<!-- Index-keyed deliberately: `params` is immutable for the life of the key block
			above, and identity keys would collide when the same snippet registers on nested
			elements. -->
			{#each contextmenu.params as p, i (i)}
				{#if typeof p === 'function'}
					{@render p()}
				{:else if p.snippet === 'link'}
					{@render link_entry?.(p.props)}
				{:else if p.snippet === 'text'}
					{@render text_entry?.(p.props)}
				{:else if p.snippet === 'separator'}
					{@render separator_entry?.(p.props)}
				{/if}
			{/each}
		</ul>
	{/key}
{/if}

{#snippet link_entry_default(props: ComponentProps<typeof ContextmenuLinkEntry>)}
	<ContextmenuLinkEntry {...props} />
{/snippet}

{#snippet text_entry_default(props: ComponentProps<typeof ContextmenuTextEntry>)}
	<ContextmenuTextEntry {...props} />
{/snippet}

{#snippet separator_entry_default(props: ComponentProps<typeof ContextmenuSeparator>)}
	<ContextmenuSeparator {...props} />
{/snippet}

<style>
	.contextmenu {
		--icon_size: var(--icon_size_xs);
		/* TODO maybe make this responsive or a max of the page width
		minus some space to tap items covered by the menu on the side,
		or consider a totally different design for small screens (more dialog-like)  */
		--contextmenu_width: 320px;
		position: fixed;
		left: 0;
		top: 0;
		/* the z-index is the fallback for browsers without the Popover API,
		where the menu can't layer over modal dialogs */
		z-index: var(--contextmenu_z_index, 200);
		max-width: var(--contextmenu_width);
		width: 100%;
		/* reset the UA `[popover]` styles; positioning stays transform-based */
		right: auto;
		bottom: auto;
		margin: 0;
		padding: 0;
		color: inherit;
		/* the UA popover style sets `overflow: auto`, which would clip submenu flyouts */
		overflow: visible;
		/* Re-enable callouts on the menu itself to allow the native contextmenu (for dev
		   tools) and prevent the menu from being selected. Only meaningful under
		   `ContextmenuRootForSafariCompatibility`'s `body.contextmenu-pending` blocking -
		   inert under `ContextmenuRoot`, which never renders on iOS Safari. */
		-webkit-touch-callout: initial !important;
	}
	/* TODO hacky */
	.contextmenu,
	.contextmenu :global(menu.pane) {
		border: var(--contextmenu_border_width, var(--border_width))
			var(--contextmenu_border_style, var(--border_style))
			var(--contextmenu_border_color, var(--border_color));
		border-radius: var(--contextmenu_border_radius, var(--border_radius_xs));
	}

	/* TODO better way to do this? */
	.contextmenu-layout {
		z-index: -200;
		position: fixed;
		inset: 0;
	}
</style>
