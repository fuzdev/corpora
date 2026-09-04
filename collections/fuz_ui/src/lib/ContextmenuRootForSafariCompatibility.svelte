<script lang="ts">
	/**
	 * This alternative to `ContextmenuRoot`
	 * implements custom touch event handlers and "longpress" detection to work
	 * around iOS Safari not firing the standard `contextmenu` event -- see
	 * https://bugs.webkit.org/show_bug.cgi?id=213953.
	 *
	 * Prefer `ContextmenuRoot.svelte` unless you specifically need iOS Safari support.
	 *
	 * This is a complex implementation with many iOS-specific hacks and edge cases:
	 *
	 * - Custom touch event handlers (touchstart, touchmove, touchend)
	 * - Longpress detection with configurable timing and movement tolerance
	 * - Tap-then-longpress bypass gesture for accessing system contextmenu
	 * - Calls navigator.vibrate() for haptic feedback, but browsers block it due to longpress timeout workaround
	 *
	 * Otherwise, use the default `ContextmenuRoot.svelte` which is much simpler
	 * and relies on the standard `contextmenu` event.
	 */
	import { swallow } from '@fuzdev/fuz_util/dom.ts';
	import { on } from 'svelte/events';

	import {
		contextmenu_context,
		ContextmenuState,
		contextmenu_open,
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
		CONTEXTMENU_DEFAULT_LONGPRESS_DURATION,
		CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE,
		contextmenu_is_valid_target,
		contextmenu_resolve_contextmenu_event,
		ContextmenuBypassTracker,
		ContextmenuOpenGuard,
		type ContextmenuRootBaseProps
	} from './contextmenu_helpers.ts';

	const {
		contextmenu = new ContextmenuState(),
		longpress_move_tolerance = CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE,
		longpress_duration = CONTEXTMENU_DEFAULT_LONGPRESS_DURATION,
		bypass_with_tap_then_longpress = true,
		bypass_window = CONTEXTMENU_DEFAULT_BYPASS_WINDOW,
		bypass_move_tolerance = CONTEXTMENU_DEFAULT_BYPASS_MOVE_TOLERANCE,
		open_offset_x = CONTEXTMENU_DEFAULT_OPEN_OFFSET_X,
		open_offset_y = CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y,
		scoped = false,
		link_entry = link_entry_default,
		text_entry = text_entry_default,
		separator_entry = separator_entry_default,
		children
	}: ContextmenuRootBaseProps & {
		/**
		 * The number of pixels the pointer can be moved without canceling `longpress`.
		 */
		longpress_move_tolerance?: number;
		/**
		 * The number of milliseconds after a touch starts before opening the Fuz contextmenu.
		 */
		longpress_duration?: number;
	} = $props();

	contextmenu_context.set(() => contextmenu);

	contextmenu_check_global_root(() => scoped); // DEV-only internally, eliminated from production bundles

	// The menu element while opened, bound from `ContextmenuMenu.svelte`.
	let el: HTMLElement | undefined = $state.raw();

	// TODO maybe show an indicator fade in at these coordinates

	// Longpress tracking state - plain non-reactive variables, only used inside event handlers.
	let touch_x = 0;
	let touch_y = 0;
	let longpress_timeout: NodeJS.Timeout | null = null;
	let longpress_opened = false;

	const bypass_tracker = new ContextmenuBypassTracker();
	const open_guard = new ContextmenuOpenGuard();

	/**
	 * Adds contextmenu-pending class to body during longpress tracking.
	 * This applies aggressive user-select/touch-callout blocking via CSS
	 * to give iOS the earliest possible signal to not show selection UI.
	 */
	const add_contextmenu_pending_class = (): void => {
		document.body.classList.add('contextmenu-pending');
	};

	/**
	 * Removes contextmenu-pending class from body when tracking ends.
	 */
	const remove_contextmenu_pending_class = (): void => {
		document.body.classList.remove('contextmenu-pending');
	};

	/**
	 * Resets only the longpress timeout state, preserving tap tracking for bypass detection.
	 * This is called when a touch ends before longpress completes.
	 */
	const reset_longpress_timeout = (): void => {
		longpress_opened = false;
		if (longpress_timeout !== null) {
			clearTimeout(longpress_timeout);
			longpress_timeout = null;
		}
		remove_contextmenu_pending_class();
		// Don't clear tap tracking state here - we need it for tap-then-longpress detection
	};

	/**
	 * Resets all state - both longpress and tap tracking.
	 */
	const reset_all = (): void => {
		reset_longpress_timeout(); // Also removes contextmenu-pending class
		bypass_tracker.reset();
	};

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
		// handle touch devices that trigger `'contextmenu'` slower than our longpress
		if (longpress_opened) {
			// Don't prevent contextmenu events on elements inside our own contextmenu
			// This allows the browser's native contextmenu (useful for dev tools, inspecting elements, etc.)
			if (el?.contains(e.target as Node)) {
				return; // Let the event pass through
			}
			reset_all();
			swallow(e);
			return;
		}
		if (contextmenu_resolve_contextmenu_event(e, contextmenu, el, open_guard, open_options)) {
			reset_all(); // handle touch devices that trigger `'contextmenu'` faster than our longpress
		}
	};

	// Needed for the iOS workaround. Registered non-passively via `touch_event_attachment` (window or scoped element).
	const touchstart = (e: TouchEvent): void => {
		longpress_opened = false;
		open_guard.touchstart(); // begins a gesture, clearing stale flags
		const { touches, target } = e;
		if (
			contextmenu.opened ||
			touches.length !== 1 ||
			!contextmenu_is_valid_target(target, e.shiftKey)
		) {
			// Reset all state when conditions aren't met
			reset_all();
			return;
		}

		const { clientX, clientY } = touches[0]!;

		// The builtin `'contextmenu'` event will still fire for non-iOS browsers,
		// so the tracker's `bypassed` flag tells `on_window_contextmenu` to exit early.
		if (
			bypass_with_tap_then_longpress &&
			bypass_tracker.track(clientX, clientY, bypass_window, bypass_move_tolerance)
		) {
			return;
		}

		touch_x = clientX;
		touch_y = clientY;

		// Add pending class to enable aggressive iOS blocking via CSS during tracking
		add_contextmenu_pending_class();

		if (longpress_timeout !== null) reset_longpress_timeout();
		longpress_timeout = setTimeout(() => {
			longpress_opened = true;
			remove_contextmenu_pending_class(); // Tracking complete, menu opening
			if (
				contextmenu_open(
					target,
					touch_x + open_offset_x,
					touch_y + open_offset_y,
					contextmenu,
					open_options
				)
			) {
				// guard the release of this gesture from interacting with the menu
				open_guard.opened();
			}
		}, longpress_duration);
	};

	// Needed for the iOS workaround. Registered non-passively via `touch_event_attachment` (window or scoped element).
	const touchmove = (e: TouchEvent): void => {
		// Exit early if no pending longpress or menu is already open
		if (longpress_timeout === null || contextmenu.opened) return;
		const { touches } = e;
		if (touches.length !== 1) return;
		const { clientX, clientY } = touches[0]!;
		const distance = Math.hypot(clientX - touch_x, clientY - touch_y);
		if (distance > longpress_move_tolerance) {
			// User is scrolling - cancel longpress but DON'T preventDefault
			reset_longpress_timeout();
			return;
		}
		// Still within threshold - this is a longpress
		// CRITICAL: Prevent iOS from showing magnifier, text selection, and link callouts
		e.preventDefault();
	};
	// Needed for the iOS workaround. Registered non-passively via `touch_event_attachment` (window or scoped element).
	const touchend = (e: TouchEvent): void => {
		// Swallow the release of a gesture that opened the menu (custom longpress or
		// native `contextmenu`), stopping the browser from synthesizing mouse events at
		// the touch point that would activate the first item, and arming the click
		// blocker for iOS, which can synthesize the click regardless.
		open_guard.touchend(e);
		// Clear longpress timeout if it exists
		if (longpress_timeout !== null) {
			reset_longpress_timeout();
		}
		// Clear a pending bypass when the user lifts before the native contextmenu opens.
		// Tap tracking is otherwise preserved for tap-then-longpress detection.
		bypass_tracker.consume();
	};

	/**
	 * Handle touchcancel - this should reset all state since the gesture was interrupted.
	 */
	const touchcancel = (): void => {
		open_guard.reset();
		reset_all();
	};

	/**
	 * Creates an attachment that registers touch event listeners with { passive: false }
	 * to enable preventDefault() on iOS Safari. Works for both window (non-scoped mode) and
	 * HTMLElement (scoped mode). Svelte's declarative touch handlers create passive listeners
	 * by default, which prevents blocking iOS's default longpress behaviors (magnifier, text
	 * selection, callouts). Using `on()` from svelte/events ensures proper event ordering
	 * with Svelte's event delegation system.
	 *
	 * The critical fix is calling preventDefault() in the touchmove handler when tracking
	 * a longpress with movement below threshold.
	 *
	 * @param el - the Window or HTMLElement to attach touch listeners to
	 * @returns cleanup function to remove all event listeners
	 */
	const touch_event_attachment = (el: HTMLElement | Window) => {
		// touchstart and touchcancel don't call preventDefault, so they can be passive for better performance
		const passive_options: AddEventListenerOptions = { passive: true, capture: true };
		// touchmove and touchend need to call preventDefault to block iOS behaviors, so they must be non-passive
		const nonpassive_options: AddEventListenerOptions = { passive: false, capture: true };

		const cleanup_touchstart = on(el, 'touchstart', touchstart as EventListener, passive_options);
		const cleanup_touchmove = on(el, 'touchmove', touchmove as EventListener, nonpassive_options);
		const cleanup_touchend = on(el, 'touchend', touchend as EventListener, nonpassive_options);
		const cleanup_touchcancel = on(
			el,
			'touchcancel',
			touchcancel as EventListener,
			passive_options
		);

		return () => {
			cleanup_touchstart();
			cleanup_touchmove();
			cleanup_touchend();
			cleanup_touchcancel();
		};
	};
</script>

<svelte:window
	oncontextmenu={scoped ? undefined : on_window_contextmenu}
	{@attach scoped ? undefined : touch_event_attachment}
/>

{#if scoped}
	<!-- A transparent (`display: contents`) event-delegation wrapper. `role="group"` rather
	than a landmark role - it satisfies the a11y lint without requiring an accessible name. -->
	<div
		class="contextmenu-root"
		role="group"
		oncontextmenu={on_window_contextmenu}
		{@attach touch_event_attachment}
	>
		{@render children()}
	</div>
{:else}
	{@render children()}
{/if}

<ContextmenuMenu bind:el {contextmenu} {open_guard} {link_entry} {text_entry} {separator_entry} />

<style>
	:global(body.contextmenu-pending) {
		/* Applied during active longpress tracking.
		   Aggressive blocking to give iOS earliest possible signal to not show selection UI.
		   Combined with preventDefault() in touchmove for defense in depth. */
		-webkit-user-select: none !important;
		user-select: none !important;
		-webkit-touch-callout: none !important;
	}

	.contextmenu-root {
		display: contents;
	}
</style>
