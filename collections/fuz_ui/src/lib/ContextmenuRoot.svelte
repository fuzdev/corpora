<script lang="ts">
	/**
	 * This is the default contextmenu root component.
	 * It relies on the standard browser `contextmenu` event
	 * which means it does not work on iOS Safari
	 * because it doesn't fire the `contextmenu` event as of October 2025 --
	 * see https://bugs.webkit.org/show_bug.cgi?id=213953.
	 *
	 * This is the recommended default because
	 * it supports haptic feedback with `navigator.vibrate()`.
	 * The Safari compatibility version uses timeout-based longpress detection,
	 * which causes browsers to block `navigator.vibrate()` since it's not
	 * triggered directly by a user event.
	 *
	 * If you need iOS Safari support, use `ContextmenuRootForSafariCompatibility.svelte`
	 * instead. That version implements custom touch handlers and longpress detection at the
	 * cost of significantly more complexity and no vibrate support.
	 */
	import {
		contextmenu_context,
		ContextmenuState,
		contextmenu_check_global_root
	} from './contextmenu_state.svelte.ts';
	import ContextmenuMenu, {
		link_entry_default,
		text_entry_default,
		separator_entry_default
	} from './ContextmenuMenu.svelte';
	import {
		CONTEXTMENU_DEFAULT_OPEN_OFFSET_X,
		CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y,
		CONTEXTMENU_DEFAULT_BYPASS_WINDOW,
		CONTEXTMENU_DEFAULT_BYPASS_MOVE_TOLERANCE,
		contextmenu_is_valid_target,
		contextmenu_resolve_contextmenu_event,
		ContextmenuBypassTracker,
		ContextmenuOpenGuard,
		type ContextmenuRootBaseProps
	} from './contextmenu_helpers.ts';

	const {
		contextmenu = new ContextmenuState(),
		open_offset_x = CONTEXTMENU_DEFAULT_OPEN_OFFSET_X,
		open_offset_y = CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y,
		bypass_with_tap_then_longpress = true,
		bypass_window = CONTEXTMENU_DEFAULT_BYPASS_WINDOW,
		bypass_move_tolerance = CONTEXTMENU_DEFAULT_BYPASS_MOVE_TOLERANCE,
		scoped = false,
		link_entry = link_entry_default,
		text_entry = text_entry_default,
		separator_entry = separator_entry_default,
		children
	}: ContextmenuRootBaseProps = $props();

	contextmenu_context.set(() => contextmenu);

	contextmenu_check_global_root(() => scoped); // DEV-only internally, eliminated from production bundles

	// The menu element while opened, bound from `ContextmenuMenu.svelte`.
	let el: HTMLElement | undefined = $state.raw();

	const bypass_tracker = new ContextmenuBypassTracker();
	const open_guard = new ContextmenuOpenGuard();

	const open_options = $derived({
		open_offset_x,
		open_offset_y,
		link_enabled: link_entry !== null,
		text_enabled: text_entry !== null,
		separator_enabled: separator_entry !== null
	});

	const on_window_contextmenu = (e: MouseEvent) => {
		// let the system contextmenu through after a tap-then-longpress bypass gesture
		if (bypass_tracker.consume()) return;
		contextmenu_resolve_contextmenu_event(e, contextmenu, el, open_guard, open_options);
	};

	/**
	 * Touch event handler for tap-then-longpress bypass detection
	 * and touch-open release guarding.
	 *
	 * The bypass gesture allows users to access the native context menu by performing
	 * a tap followed by a longpress/rightclick within a specified time window,
	 * useful for browser features like text selection when the Fuz contextmenu
	 * would normally override it.
	 *
	 * Note: preventDefault is not called as we're only observing touch patterns,
	 * not intercepting them. The actual bypass happens in on_window_contextmenu.
	 */
	const touchstart = (e: TouchEvent): void => {
		open_guard.touchstart();

		if (!bypass_with_tap_then_longpress) return;

		const { touches, target } = e;
		if (
			contextmenu.opened ||
			touches.length !== 1 ||
			!contextmenu_is_valid_target(target, e.shiftKey)
		) {
			bypass_tracker.reset();
			return;
		}

		const { clientX, clientY } = touches[0]!;
		bypass_tracker.track(clientX, clientY, bypass_window, bypass_move_tolerance);
	};

	/**
	 * Swallows the release of a gesture that opened the menu,
	 * stopping the browser from synthesizing mouse events at the touch point
	 * (the open offsets place the first menu item there).
	 */
	const touchend = (e: TouchEvent): void => {
		open_guard.touchend(e);
		// Clear a pending bypass when the user lifts before the native contextmenu fires -
		// no native menu appeared, so the bypass must not linger to eat a future right-click.
		// Tap tracking is otherwise preserved for tap-then-longpress detection.
		bypass_tracker.consume();
	};

	/**
	 * Reset state when touch is cancelled (e.g., when scrolling starts).
	 */
	const touchcancel = (): void => {
		open_guard.reset();
		bypass_tracker.reset();
	};
</script>

<svelte:window
	oncontextmenu={scoped ? undefined : on_window_contextmenu}
	ontouchstartcapture={scoped ? undefined : touchstart}
	ontouchendcapture={scoped ? undefined : touchend}
	ontouchcancelcapture={scoped ? undefined : touchcancel}
/>

{#if scoped}
	<!-- A transparent (`display: contents`) event-delegation wrapper. `role="group"` rather
	than a landmark role - it satisfies the a11y lint without requiring an accessible name. -->
	<div
		class="contextmenu-root"
		role="group"
		oncontextmenu={on_window_contextmenu}
		ontouchstartcapture={touchstart}
		ontouchendcapture={touchend}
		ontouchcancelcapture={touchcancel}
	>
		{@render children()}
	</div>
{:else}
	{@render children()}
{/if}

<ContextmenuMenu bind:el {contextmenu} {open_guard} {link_entry} {text_entry} {separator_entry} />

<style>
	.contextmenu-root {
		display: contents;
	}
</style>
