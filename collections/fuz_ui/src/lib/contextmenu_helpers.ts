import { is_editable, swallow, inside_editable } from '@fuzdev/fuz_util/dom.ts';
import { EMPTY_OBJECT } from '@fuzdev/fuz_util/object.ts';
import type { Attachment } from 'svelte/attachments';
import type { ComponentProps, Snippet } from 'svelte';

import {
	contextmenu_open,
	type ContextmenuOpenOptions,
	type ContextmenuState
} from './contextmenu_state.svelte.ts';
import type ContextmenuLinkEntry from './ContextmenuLinkEntry.svelte';
import type ContextmenuTextEntry from './ContextmenuTextEntry.svelte';
import type ContextmenuSeparator from './ContextmenuSeparator.svelte';

// Constants for default prop values
export const CONTEXTMENU_DEFAULT_OPEN_OFFSET_X = -2;
export const CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y = -2;
export const CONTEXTMENU_DEFAULT_BYPASS_WINDOW = 750;
export const CONTEXTMENU_DEFAULT_BYPASS_MOVE_TOLERANCE = 11;
export const CONTEXTMENU_DEFAULT_LONGPRESS_DURATION = 633;
export const CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE = 21;

/**
 * Props shared by `ContextmenuRoot.svelte` and `ContextmenuRootForSafariCompatibility.svelte`.
 * Defaults are applied identically by both roots.
 */
export interface ContextmenuRootBaseProps {
	/**
	 * The contextmenu state. Each root defaults to its own new instance -
	 * pass one to control or observe the menu externally.
	 */
	contextmenu?: ContextmenuState;
	/**
	 * The number of pixels to offset from the pointer X position when opened.
	 * Useful to ensure the first menu item is immediately under the pointer.
	 */
	open_offset_x?: number;
	/**
	 * The number of pixels to offset from the pointer Y position when opened.
	 * Useful to ensure the first menu item is immediately under the pointer.
	 */
	open_offset_y?: number;
	/**
	 * Whether to detect tap-then-longpress to bypass the Fuz contextmenu.
	 * This allows access to the system contextmenu by tapping once then rightclicking/long-pressing.
	 * Setting to `false` disables the gesture.
	 */
	bypass_with_tap_then_longpress?: boolean;
	/**
	 * The number of milliseconds between taps to detect a gesture that bypasses the Fuz contextmenu.
	 * Used only when `bypass_with_tap_then_longpress` is true.
	 * If the duration is too long, it'll detect more false positives and interrupt normal usage,
	 * but too short and some people will have difficulty performing the gesture.
	 */
	bypass_window?: number;
	/**
	 * The number of pixels the pointer can be moved between taps to detect a tap-then-longpress.
	 * Used only when `bypass_with_tap_then_longpress` is true.
	 */
	bypass_move_tolerance?: number;
	/**
	 * If `true`, wraps `children` with a div and listens to events on it instead of the window.
	 */
	scoped?: boolean;
	/**
	 * Snippet for rendering link entries.
	 * Set to `null` to disable automatic link detection.
	 * Defaults to `link_entry_default` which renders `ContextmenuLinkEntry`.
	 */
	link_entry?: Snippet<[ComponentProps<typeof ContextmenuLinkEntry>]> | null;
	/**
	 * Snippet for rendering copy text entries.
	 * Set to `null` to disable automatic copy text detection.
	 * Defaults to `text_entry_default` which renders `ContextmenuTextEntry`.
	 */
	text_entry?: Snippet<[ComponentProps<typeof ContextmenuTextEntry>]> | null;
	/**
	 * Snippet for rendering separator entries.
	 * Set to `null` to disable automatic separator rendering.
	 * Defaults to `separator_entry_default` which renders `ContextmenuSeparator`.
	 */
	separator_entry?: Snippet<[ComponentProps<typeof ContextmenuSeparator>]> | null;
	/**
	 * The content the root listens over for contextmenu gestures.
	 */
	children: Snippet;
}

/**
 * Returns true if valid and narrows the type to HTMLElement | SVGElement.
 */
export const contextmenu_is_valid_target = (
	target: EventTarget | null,
	shiftKey: boolean
): target is HTMLElement | SVGElement =>
	!shiftKey &&
	(target instanceof HTMLElement || target instanceof SVGElement) &&
	!is_editable(target) &&
	!inside_editable(target);

// TODO maybe bind these to the contextmenu instance instead of including the function wrapper
// TODO customize
export const contextmenu_create_keyboard_handlers = (
	contextmenu: ContextmenuState
): Map<string, () => void> =>
	new Map([
		['Escape', () => contextmenu.close()],
		['ArrowLeft', () => contextmenu.collapse_selected()],
		['ArrowRight', () => contextmenu.expand_selected()],
		['ArrowDown', () => contextmenu.select_next()],
		['ArrowUp', () => contextmenu.select_previous()],
		['Home', () => contextmenu.select_first()],
		['End', () => contextmenu.select_last()],
		[' ', () => contextmenu.activate_selected()],
		['Enter', () => contextmenu.activate_selected()]
	]);

export const contextmenu_create_keydown_handler =
	(keyboard_handlers: Map<string, () => void>): ((e: KeyboardEvent) => void) =>
	(e: KeyboardEvent): void => {
		const handler = keyboard_handlers.get(e.key);
		if (!handler || is_editable(e.target)) return;
		swallow(e);
		handler();
	};

/**
 * Constrains the menu's x coordinate to the layout, shifting left to fit the right edge.
 * Clamps at `0` so a menu wider than the layout pins its left edge - the start of each
 * item stays visible.
 */
export const contextmenu_calculate_constrained_x = (
	menu_x: number,
	menu_width: number,
	layout_width: number
): number => Math.max(0, menu_x + Math.min(0, layout_width - (menu_x + menu_width)));

/**
 * Constrains the menu's y coordinate to the layout, shifting up to fit the bottom edge.
 * Clamps at `0` so a menu taller than the layout pins its top edge - the first
 * items stay visible.
 */
export const contextmenu_calculate_constrained_y = (
	menu_y: number,
	menu_height: number,
	layout_height: number
): number => Math.max(0, menu_y + Math.min(0, layout_height - (menu_y + menu_height)));

export interface ContextmenuSubmenuTranslateOptions {
	/** The submenu's untranslated viewport x - the parent menu's left edge. */
	base_x: number;
	/** The submenu's untranslated viewport y. */
	base_y: number;
	/** The submenu's width. */
	width: number;
	/** The submenu's height. */
	height: number;
	/** The parent menu's width. */
	parent_width: number;
	/** The layout's width. */
	layout_width: number;
	/** The layout's height. */
	layout_height: number;
}

/**
 * Calculates a submenu flyout's translation so it fits the layout.
 *
 * Preference order on the x axis: fly out to the right of the parent menu,
 * else flip fully to the left of it, else shift to pin whichever side
 * overflows less. The y axis shifts up only as far as needed to fit the
 * bottom edge.
 *
 * Used by `ContextmenuSubmenu.svelte`.
 */
export const contextmenu_calculate_submenu_translate = (
	options: ContextmenuSubmenuTranslateOptions
): { x: number; y: number } => {
	const { base_x, base_y, width, height, parent_width, layout_width, layout_height } = options;
	let x: number;
	const overflow_right = base_x + width + parent_width - layout_width;
	if (overflow_right <= 0) {
		x = parent_width;
	} else {
		const overflow_left = width - base_x;
		if (overflow_left <= 0) {
			x = -width;
		} else if (overflow_left > overflow_right) {
			x = parent_width - overflow_right;
		} else {
			x = overflow_left - width;
		}
	}
	const y = Math.min(0, layout_height - (base_y + height));
	return { x, y };
};

export interface ContextmenuOpenFromEventOptions extends ContextmenuOpenOptions {
	/**
	 * The number of pixels to offset from the pointer X position when opened.
	 */
	open_offset_x?: number;
	/**
	 * The number of pixels to offset from the pointer Y position when opened.
	 */
	open_offset_y?: number;
}

/**
 * Handles a `contextmenu` event by opening the contextmenu from the event target,
 * unless the target is invalid or inside the open menu element.
 * Swallows the event when the menu opens.
 *
 * @param e - the `contextmenu` event
 * @param contextmenu - the contextmenu state
 * @param menu_el - the open menu element, if any, so events inside it are ignored
 * @param options - offsets and entry filtering forwarded to `contextmenu_open`
 * @returns whether the contextmenu was opened
 */
export const contextmenu_open_from_event = (
	e: MouseEvent,
	contextmenu: ContextmenuState,
	menu_el: HTMLElement | undefined,
	options?: ContextmenuOpenFromEventOptions
): boolean => {
	const {
		open_offset_x = CONTEXTMENU_DEFAULT_OPEN_OFFSET_X,
		open_offset_y = CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y
	} = options ?? EMPTY_OBJECT;
	const { target } = e;
	if (!contextmenu_is_valid_target(target, e.shiftKey)) return false;
	// don't open the contextmenu when clicking on the menu itself
	if (menu_el?.contains(target)) return false;
	if (
		!contextmenu_open(
			target,
			e.clientX + open_offset_x,
			e.clientY + open_offset_y,
			contextmenu,
			options
		)
	) {
		return false;
	}
	swallow(e);
	return true;
};

/**
 * Resolves a `contextmenu` event: opens the menu from the event target when possible
 * (arming `open_guard` against the gesture's residual events), otherwise lets the
 * native contextmenu show - closing ours unless the press was on the menu itself.
 *
 * Shared by `ContextmenuRoot.svelte` and `ContextmenuRootForSafariCompatibility.svelte`,
 * after their root-specific bypass and longpress handling.
 *
 * @param e - the `contextmenu` event
 * @param contextmenu - the contextmenu state
 * @param menu_el - the open menu element, if any
 * @param open_guard - guard that identifies presses belonging to the gesture that opened the menu
 * @param options - offsets and entry filtering forwarded to `contextmenu_open`
 * @returns whether the contextmenu was opened
 */
export const contextmenu_resolve_contextmenu_event = (
	e: MouseEvent,
	contextmenu: ContextmenuState,
	menu_el: HTMLElement | undefined,
	open_guard: ContextmenuOpenGuard,
	options?: ContextmenuOpenFromEventOptions
): boolean => {
	if (contextmenu_open_from_event(e, contextmenu, menu_el, options)) {
		// guard the menu from the residual events of the gesture that opened it
		open_guard.opened();
		return true;
	}
	// The right-click didn't (re)open the menu - a press on the menu itself, an invalid
	// target, shift bypass, or no entries - so the native contextmenu shows.
	if (contextmenu.opened && menu_el && !menu_el.contains(e.target as Node | null)) {
		// Close ours and let the native contextmenu show. Unmodified secondary-button
		// presses never close via the mousedown handler; this is where their gesture
		// resolves (shift+rightclick closes on the press - Firefox suppresses its
		// `contextmenu` event entirely).
		contextmenu.close();
	}
	return false;
};

/**
 * Creates a `mousedown` handler that closes the contextmenu when pressing outside of
 * the menu element, deferring to `open_guard` for presses that belong to the gesture
 * that opened the menu: gesture presses outside don't close, and gesture presses on the
 * menu arm the click blocker instead of activating the entry under the pointer.
 *
 * Secondary-button presses outside the menu never close here - their own `contextmenu`
 * event resolves the menu in the roots' handlers (reopening it elsewhere, or closing it
 * when there's nothing to open) - with one exception: shift+rightclick, an explicit
 * native-menu request whose `contextmenu` event Firefox suppresses entirely, closes on
 * the press itself.
 *
 * Registered on the window during the bubble phase deliberately -
 * consumers keep the menu open through a press by swallowing the event
 * (e.g. menu controller buttons that use `onmousedowncapture` + `swallow`).
 *
 * @param contextmenu - the contextmenu state
 * @param get_menu_el - getter for the open menu element, if any
 * @param open_guard - guard that identifies presses belonging to the gesture that opened the menu
 */
// TODO consider `popover="auto"` instead of `"manual"` (see `contextmenu_popover_attachment`) -
// its light dismiss would replace this handler and fix Escape ordering over dialogs
// via close watchers, but it would break consumers that swallow `mousedown` to keep
// the menu open through presses on their own controls
export const contextmenu_create_mousedown_handler =
	(
		contextmenu: ContextmenuState,
		get_menu_el: () => HTMLElement | undefined,
		open_guard?: ContextmenuOpenGuard
	) =>
	(e: MouseEvent): void => {
		const menu_el = get_menu_el();
		if (!menu_el) return;
		if (menu_el.contains(e.target as Node | null)) {
			// a press on the menu belonging to the opening gesture must not click-activate
			open_guard?.mousedown_on_menu(e);
			return;
		}
		// A shift+rightclick is an explicit native-menu request that our handlers may
		// never see resolve - Firefox suppresses its `contextmenu` event entirely - so
		// close on the press itself, matching the unsuppressed outcome in other browsers.
		if (e.button === 2 && e.shiftKey) {
			contextmenu.close();
			return;
		}
		// Presses belonging to the opening gesture must not close the menu. This includes
		// all secondary-button presses - their own `contextmenu` event resolves the menu
		// (reopening it elsewhere, or closing it when there's nothing to open).
		if (open_guard?.press_belongs_to_open_gesture(e)) return;
		contextmenu.close();
	};

/**
 * Resolves the element that must host the contextmenu popover for it to stay
 * interactive: the modal `<dialog>` containing `target`, if any.
 *
 * A modal dialog makes every element outside its subtree inert, and the top layer
 * fixes painting order, not inertness - so a popover shown from outside the dialog
 * paints above it but receives no pointer or focus events (hit-testing skips inert
 * elements). Only the topmost modal dialog's subtree is interactive, so the dialog
 * containing the menu's open target is by construction the one the menu must join.
 *
 * @param target - the element the menu was opened from
 * @returns the modal dialog to reparent the menu into, or `null` when the menu
 * doesn't need a host
 */
export const contextmenu_resolve_popover_host = (
	target: HTMLElement | SVGElement | undefined
): HTMLDialogElement | null =>
	(target?.closest('dialog:modal') as HTMLDialogElement | null) ?? null;

/**
 * Creates an attachment that shows the contextmenu element as a manual popover,
 * promoting it into the top layer so it paints above modal `<dialog>` elements
 * (e.g. `Dialog.svelte`) - top-layer elements paint in insertion order.
 *
 * Painting is only half of it: a modal dialog also makes everything outside its
 * subtree inert. When the menu opens from inside a modal dialog, the menu element
 * is reparented into that dialog (see `contextmenu_resolve_popover_host`) so it
 * escapes the inert-ness and stays interactive - top-layer positioning is relative
 * to the viewport regardless of ancestors, so the menu's fixed coordinates are
 * unaffected. The host dialog's `close` also closes the menu, since the menu's DOM
 * node vanishes with the dialog.
 *
 * No-ops where the Popover API is unavailable (older browsers, jsdom),
 * falling back to `--contextmenu_z_index` stacking - the menu then renders
 * beneath and inert to any open modal dialog.
 *
 * Used with the `popover="manual"` attribute - `"manual"` rather than `"auto"`
 * so opening, closing, and keyboard handling stay fully owned by `ContextmenuState`.
 */
export const contextmenu_popover_attachment =
	(contextmenu: ContextmenuState): Attachment<HTMLElement> =>
	(el) => {
		if (!el.showPopover) return;
		const host = contextmenu_resolve_popover_host(contextmenu.target);
		// reparent before showing - moving a shown popover would hide it
		if (host) host.appendChild(el);
		// guard the reactive re-run when the `contextmenu` prop changes identity -
		// `showPopover()` throws on an already-shown popover
		if (!el.matches(':popover-open')) el.showPopover();
		if (!host) return;
		const onclose = () => {
			contextmenu.close();
		};
		host.addEventListener('close', onclose);
		return () => {
			host.removeEventListener('close', onclose);
		};
	};

/**
 * Guards the menu from the residual events of the gesture that opened it,
 * using exact gesture causality - no timing heuristics or tunable windows.
 *
 * Touch: when the menu opens during a touch (the native longpress `contextmenu` event,
 * or the Safari-compat custom longpress), the release of that same gesture must not
 * interact with the menu - an unprevented `touchend` lets the browser synthesize
 * compatibility mouse events (`mousedown`/`mouseup`/`click`) at the touch point, and the
 * open offsets place the first menu item exactly there, activating it immediately.
 * `touchend` swallows the release to stop the synthesis, and `consume_blocked_click`
 * blocks the next click on the menu as belt and braces (iOS can synthesize the click
 * regardless).
 *
 * Mouse: tap-style input devices (e.g. some touchpads) can register an overlapping
 * primary-button press during the right-click gesture that opened the menu - the
 * compositor serializes the event stream, but the press's hardware `timeStamp` falls
 * inside the gesture, and its delivery can lag long after the menu opened. Because the
 * open offsets place the first menu item under the pointer, that press's `click` would
 * activate the entry. `press_belongs_to_open_gesture` identifies overlap presses
 * exactly: the press's own `buttons` bitmask shows the secondary button still down
 * at generation time, or its `timeStamp` predates the release tracked by
 * `track_mouseup`. No pressed-state is tracked across events deliberately: the native
 * contextmenu's pointer grab swallows the secondary `mouseup` whenever it opens
 * (right-click on our menu, shift+rightclick - which in Firefox doesn't even fire
 * the `contextmenu` event), so a tracked flag wedges stuck, while the judged press's
 * own `buttons` self-corrects. A deliberate right-then-left click - however fast -
 * is sequential in hardware time and is never blocked.
 *
 * Plain DOM-event bookkeeping with no reactive state - used only inside event handlers
 * by `ContextmenuRoot.svelte` and `ContextmenuRootForSafariCompatibility.svelte`.
 */
export class ContextmenuOpenGuard {
	#touch_active = false;
	#opened_by_touch = false;
	#block_next_click = false;
	#last_secondary_up_time = -Infinity;
	#last_touch_end_time = -Infinity;

	/**
	 * Begins a new gesture on `touchstart`, clearing stale flags from the previous one.
	 */
	touchstart(): void {
		this.#touch_active = true;
		this.#opened_by_touch = false;
		this.#block_next_click = false;
	}

	/**
	 * Arms the touch release guard for the gesture that just opened the menu.
	 * Call after a successful open.
	 */
	opened(): void {
		if (this.#touch_active) this.#opened_by_touch = true;
	}

	/**
	 * Tracks the physical secondary button's release - call from an always-on
	 * window `mouseup` capture listener. The release may never be delivered
	 * (the native contextmenu's pointer grab eats it), which is why
	 * `press_belongs_to_open_gesture` never depends on it alone.
	 */
	track_mouseup(e: MouseEvent): void {
		if (e.button === 2) {
			this.#last_secondary_up_time = e.timeStamp;
		}
	}

	/**
	 * Returns `true` when a press belongs to the gesture that opened the menu
	 * rather than being a deliberate response to it:
	 * secondary-button presses (their own `contextmenu` event resolves them),
	 * presses during or predating an active touch (synthesized compatibility events),
	 * and presses overlapping the secondary button in hardware time - the press's
	 * own `buttons` bitmask shows the secondary button still down at generation
	 * time, or its `timeStamp` predates the release tracked by `track_mouseup`.
	 */
	press_belongs_to_open_gesture(e: MouseEvent): boolean {
		if (e.button === 2) return true;
		if (this.#touch_active || e.timeStamp <= this.#last_touch_end_time) return true;
		return (e.buttons & 2) !== 0 || e.timeStamp <= this.#last_secondary_up_time;
	}

	/**
	 * Handles a `mousedown` that landed on the menu element: when a primary-button
	 * press belongs to the opening gesture, its `click` is blocked from activating the
	 * entry that the open offsets placed under the pointer. Non-primary presses never
	 * arm the blocker - they produce no `click`, so an armed blocker would linger and
	 * eat the next deliberate click on the menu.
	 */
	mousedown_on_menu(e: MouseEvent): void {
		if (e.button === 0 && this.press_belongs_to_open_gesture(e)) {
			this.#block_next_click = true;
		}
	}

	/**
	 * Handles `touchend`: when the release belongs to the gesture that opened the menu,
	 * swallows it (stopping mouse event synthesis) and arms the click blocker,
	 * returning `true`.
	 */
	touchend(e: TouchEvent): boolean {
		this.#touch_active = e.touches.length > 0;
		this.#last_touch_end_time = e.timeStamp;
		if (!this.#opened_by_touch) return false;
		this.#opened_by_touch = false;
		swallow(e);
		this.#block_next_click = true;
		return true;
	}

	/**
	 * Clears gesture state, including any armed click blocker. Call on `touchcancel`.
	 * The secondary release timestamp persists - it mirrors hardware history,
	 * not gesture state.
	 */
	reset(): void {
		this.#touch_active = false;
		this.#opened_by_touch = false;
		this.#block_next_click = false;
	}

	/**
	 * Consumes an armed click blocker, returning `true` if the click should be swallowed.
	 * Call from the menu element's `click` capture handler.
	 */
	consume_blocked_click(): boolean {
		if (!this.#block_next_click) return false;
		this.#block_next_click = false;
		return true;
	}
}

/**
 * Tracks the tap-then-longpress gesture that bypasses the Fuz contextmenu,
 * letting users reach the system contextmenu by tapping once
 * then longpressing/rightclicking within a time window.
 *
 * Plain DOM-event bookkeeping with no reactive state - used only inside event handlers
 * by `ContextmenuRoot.svelte` and `ContextmenuRootForSafariCompatibility.svelte`.
 */
export class ContextmenuBypassTracker {
	#first_tap_time: number | null = null;
	#touch_x = 0;
	#touch_y = 0;
	#timeout: NodeJS.Timeout | null = null;

	/**
	 * Set when a tap-then-longpress is detected,
	 * telling the next `contextmenu` event handler to let the system contextmenu through.
	 */
	bypassed = false;

	/**
	 * Records a single-touch `touchstart` at the given coordinates.
	 * Detects a tap-then-longpress when the previous tap happened within `bypass_window`
	 * milliseconds and moved less than `bypass_move_tolerance` pixels,
	 * setting `bypassed` and returning `true`.
	 * Otherwise records the tap for future detection and returns `false`.
	 */
	track(x: number, y: number, bypass_window: number, bypass_move_tolerance: number): boolean {
		if (
			this.#first_tap_time !== null &&
			performance.now() - this.#first_tap_time < bypass_window &&
			Math.hypot(x - this.#touch_x, y - this.#touch_y) < bypass_move_tolerance
		) {
			this.bypassed = true;
			this.#clear_tap_tracking();
			return true;
		}
		this.#first_tap_time = performance.now();
		this.#touch_x = x;
		this.#touch_y = y;
		// clear stale tap tracking after the detection window expires
		if (this.#timeout !== null) clearTimeout(this.#timeout);
		this.#timeout = setTimeout(() => {
			this.reset();
		}, bypass_window);
		return false;
	}

	/**
	 * Consumes a pending bypass, returning `true` and resetting all state if `bypassed` was set,
	 * otherwise returning `false` with no effect so tap tracking is preserved.
	 */
	consume(): boolean {
		if (!this.bypassed) return false;
		this.reset();
		return true;
	}

	/**
	 * Clears all tracking state including any pending bypass.
	 */
	reset(): void {
		this.bypassed = false;
		this.#clear_tap_tracking();
	}

	#clear_tap_tracking(): void {
		this.#first_tap_time = null;
		if (this.#timeout !== null) {
			clearTimeout(this.#timeout);
			this.#timeout = null;
		}
	}
}
