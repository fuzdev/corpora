/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, beforeEach, afterEach, vi } from 'vitest';

import {
	ContextmenuBypassTracker,
	ContextmenuOpenGuard,
	contextmenu_calculate_constrained_x,
	contextmenu_calculate_constrained_y,
	contextmenu_calculate_submenu_translate,
	contextmenu_create_keyboard_handlers,
	contextmenu_create_keydown_handler,
	contextmenu_create_mousedown_handler,
	contextmenu_is_valid_target,
	contextmenu_open_from_event,
	contextmenu_popover_attachment,
	contextmenu_resolve_contextmenu_event,
	contextmenu_resolve_popover_host,
	CONTEXTMENU_DEFAULT_OPEN_OFFSET_X,
	CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y
} from '$lib/contextmenu_helpers.ts';
import { ContextmenuState, contextmenu_attachment } from '$lib/contextmenu_state.svelte.ts';
import {
	create_contextmenu_event,
	create_keyboard_event,
	create_mouse_event,
	create_touch_event,
	set_event_target,
	set_event_time
} from './test_helpers.ts';
import { add_test_entry } from './contextmenu_state_test_helpers.ts';

describe('ContextmenuBypassTracker', () => {
	const BYPASS_WINDOW = 750;
	const MOVE_TOLERANCE = 11;

	let tracker: ContextmenuBypassTracker;

	beforeEach(() => {
		vi.useFakeTimers();
		tracker = new ContextmenuBypassTracker();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('second tap within window and tolerance sets bypassed and returns true', () => {
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);
		assert.strictEqual(tracker.bypassed, false);

		vi.advanceTimersByTime(300);
		assert.strictEqual(tracker.track(105, 205, BYPASS_WINDOW, MOVE_TOLERANCE), true);
		assert.strictEqual(tracker.bypassed, true);
	});

	test('second tap beyond move tolerance does not bypass', () => {
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);

		vi.advanceTimersByTime(100);
		// 50px away, beyond the 11px tolerance
		assert.strictEqual(tracker.track(150, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);
		assert.strictEqual(tracker.bypassed, false);
	});

	test('second tap after the window expires does not bypass', () => {
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);

		// advancing past the window fires the expiry timeout, clearing tap tracking
		vi.advanceTimersByTime(BYPASS_WINDOW + 100);
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);
		assert.strictEqual(tracker.bypassed, false);
	});

	test('tracking state is cleared by the expiry timeout', () => {
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);

		// fire the expiry timeout exactly at the window boundary
		vi.advanceTimersByTime(BYPASS_WINDOW);

		// a quick second tap should NOT bypass - the first tap was forgotten
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);
		assert.strictEqual(tracker.bypassed, false);

		// but tracking re-arms - a third tap shortly after the second bypasses
		vi.advanceTimersByTime(100);
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), true);
		assert.strictEqual(tracker.bypassed, true);
	});

	test('consume() returns true exactly once then false', () => {
		tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE);
		vi.advanceTimersByTime(100);
		tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE);
		assert.strictEqual(tracker.bypassed, true);

		assert.strictEqual(tracker.consume(), true);
		assert.strictEqual(tracker.bypassed, false);
		assert.strictEqual(tracker.consume(), false);
	});

	test('consume() without a pending bypass returns false and preserves tap tracking', () => {
		tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE);

		assert.strictEqual(tracker.consume(), false);

		// tap tracking was preserved, so a quick second tap still bypasses
		vi.advanceTimersByTime(100);
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), true);
	});

	test('reset() clears a pending bypass', () => {
		tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE);
		vi.advanceTimersByTime(100);
		tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE);
		assert.strictEqual(tracker.bypassed, true);

		tracker.reset();

		assert.strictEqual(tracker.bypassed, false);
		assert.strictEqual(tracker.consume(), false);
	});

	test('reset() clears tap tracking', () => {
		tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE);
		tracker.reset();

		// the first tap was forgotten, so a quick second tap does not bypass
		vi.advanceTimersByTime(100);
		assert.strictEqual(tracker.track(100, 200, BYPASS_WINDOW, MOVE_TOLERANCE), false);
		assert.strictEqual(tracker.bypassed, false);
	});
});

describe('contextmenu_calculate_constrained_x', () => {
	test('returns the coordinate unchanged when the menu fits', () => {
		assert.strictEqual(contextmenu_calculate_constrained_x(100, 200, 1000), 100);
	});

	test('returns the coordinate unchanged when the menu exactly fits', () => {
		assert.strictEqual(contextmenu_calculate_constrained_x(800, 200, 1000), 800);
	});

	test('shifts left by the overflow when the menu overflows the right edge', () => {
		assert.strictEqual(contextmenu_calculate_constrained_x(900, 200, 1000), 800);
	});

	test('clamps at zero when the menu is larger than the layout', () => {
		// A menu wider than the layout pins its left edge to the layout's left edge,
		// keeping the start of each item visible.
		assert.strictEqual(contextmenu_calculate_constrained_x(0, 1200, 1000), 0);
		assert.strictEqual(contextmenu_calculate_constrained_x(500, 1200, 1000), 0);
	});
});

describe('contextmenu_calculate_constrained_y', () => {
	test('returns the coordinate unchanged when the menu fits', () => {
		assert.strictEqual(contextmenu_calculate_constrained_y(100, 300, 768), 100);
	});

	test('returns the coordinate unchanged when the menu exactly fits', () => {
		assert.strictEqual(contextmenu_calculate_constrained_y(468, 300, 768), 468);
	});

	test('shifts up by the overflow when the menu overflows the bottom edge', () => {
		assert.strictEqual(contextmenu_calculate_constrained_y(600, 300, 768), 468);
	});

	test('clamps at zero when the menu is larger than the layout', () => {
		// A menu taller than the layout pins its top edge to the layout's top edge,
		// keeping the first items visible.
		assert.strictEqual(contextmenu_calculate_constrained_y(0, 900, 768), 0);
		assert.strictEqual(contextmenu_calculate_constrained_y(400, 900, 768), 0);
	});
});

describe('contextmenu_calculate_submenu_translate', () => {
	// A parent menu 320 wide at x=100 in a 1024x768 layout, submenu 320x200 at y=100.
	const base = {
		base_x: 100,
		base_y: 100,
		width: 320,
		height: 200,
		parent_width: 320,
		layout_width: 1024,
		layout_height: 768
	};

	test('flies out to the right of the parent menu when it fits', () => {
		assert.deepEqual(contextmenu_calculate_submenu_translate(base), { x: 320, y: 0 });
	});

	test('flips fully to the left when the right side overflows and the left fits', () => {
		// right edge would be at 700+320+320=1340 > 1024; left flip needs base_x >= width
		assert.deepEqual(contextmenu_calculate_submenu_translate({ ...base, base_x: 700 }), {
			x: -320,
			y: 0
		});
	});

	test("shifts the left flip right to pin the layout's left edge when it overflows less", () => {
		// layout 800, base_x=300: overflow_right = 300+320+320-800 = 140,
		// overflow_left = 320-300 = 20; the left flip overflows less (20 < 140),
		// so shift it right by the overflow: x = 20 - 320 = -300, landing at x=0
		assert.deepEqual(
			contextmenu_calculate_submenu_translate({ ...base, base_x: 300, layout_width: 800 }),
			{ x: -300, y: 0 }
		);
	});

	test("shifts the right flyout left to pin the layout's right edge when it overflows less", () => {
		// layout 700, base_x=100: overflow_right = 100+320+320-700 = 40,
		// overflow_left = 320-100 = 220; the right flyout overflows less (40 < 220),
		// so shift it left by the overflow: x = 320 - 40 = 280, right edge at 700
		assert.deepEqual(contextmenu_calculate_submenu_translate({ ...base, layout_width: 700 }), {
			x: 280,
			y: 0
		});
	});

	test('shifts up to fit the bottom edge', () => {
		// bottom would be at 700+200=900 > 768 -> shift up by 132
		assert.deepEqual(contextmenu_calculate_submenu_translate({ ...base, base_y: 700 }), {
			x: 320,
			y: -132
		});
	});

	test('does not shift down when the submenu fits vertically', () => {
		assert.deepEqual(contextmenu_calculate_submenu_translate({ ...base, base_y: 0 }), {
			x: 320,
			y: 0
		});
	});
});

describe('contextmenu_is_valid_target', () => {
	test('returns false when shiftKey is true', () => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		assert.strictEqual(contextmenu_is_valid_target(div, true), false);

		div.remove();
	});

	test('returns false for null', () => {
		assert.strictEqual(contextmenu_is_valid_target(null, false), false);
	});

	test('returns false for a non-element event target', () => {
		assert.strictEqual(contextmenu_is_valid_target(document, false), false);
		assert.strictEqual(contextmenu_is_valid_target(window, false), false);
	});

	test('returns false for an editable input', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);

		assert.strictEqual(contextmenu_is_valid_target(input, false), false);

		input.remove();
	});

	test('returns false for an element inside a contenteditable ancestor', () => {
		const parent = document.createElement('div');
		parent.setAttribute('contenteditable', 'true');
		const child = document.createElement('span');
		parent.appendChild(child);
		document.body.appendChild(parent);

		assert.strictEqual(contextmenu_is_valid_target(child, false), false);

		parent.remove();
	});

	test('returns true for a plain div', () => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		assert.strictEqual(contextmenu_is_valid_target(div, false), true);

		div.remove();
	});

	test('returns true for an SVG element', () => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		document.body.appendChild(svg);

		assert.strictEqual(contextmenu_is_valid_target(svg, false), true);

		svg.remove();
	});
});

describe('contextmenu_create_keydown_handler', () => {
	let contextmenu: ContextmenuState;
	let keydown: (e: KeyboardEvent) => void;
	let target: HTMLElement;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		keydown = contextmenu_create_keydown_handler(contextmenu_create_keyboard_handlers(contextmenu));
		target = document.createElement('div');
		document.body.appendChild(target);
	});

	afterEach(() => {
		target.remove();
	});

	test('Escape with the menu open closes it and swallows the event', () => {
		contextmenu.open([], 0, 0);
		assert.strictEqual(contextmenu.opened, true);

		const event = create_keyboard_event('Escape');
		set_event_target(event, target);
		keydown(event);

		assert.strictEqual(contextmenu.opened, false);
		assert.strictEqual(event.defaultPrevented, true);
	});

	test('ArrowDown invokes select_next', () => {
		const entry = add_test_entry(contextmenu.root_menu);
		contextmenu.open([], 0, 0);

		const event = create_keyboard_event('ArrowDown');
		set_event_target(event, target);
		keydown(event);

		assert.strictEqual(entry.selected, true);
		assert.strictEqual(event.defaultPrevented, true);
	});

	test('unknown key does nothing', () => {
		contextmenu.open([], 0, 0);

		const event = create_keyboard_event('a');
		set_event_target(event, target);
		keydown(event);

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(event.defaultPrevented, false);
	});

	test('known key from an editable target does nothing', () => {
		contextmenu.open([], 0, 0);
		const input = document.createElement('input');
		document.body.appendChild(input);

		const event = create_keyboard_event('Escape');
		set_event_target(event, input);
		keydown(event);

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(event.defaultPrevented, false);

		input.remove();
	});
});

describe('contextmenu_create_mousedown_handler', () => {
	let contextmenu: ContextmenuState;
	let menu_el: HTMLElement;
	let outside_el: HTMLElement;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		contextmenu.open([], 0, 0);
		menu_el = document.createElement('div');
		document.body.appendChild(menu_el);
		outside_el = document.createElement('div');
		document.body.appendChild(outside_el);
	});

	afterEach(() => {
		menu_el.remove();
		outside_el.remove();
	});

	test('closes the menu when the event target is outside the menu element', () => {
		const handler = contextmenu_create_mousedown_handler(contextmenu, () => menu_el);

		const event = create_mouse_event('mousedown');
		set_event_target(event, outside_el);
		handler(event);

		assert.strictEqual(contextmenu.opened, false);
	});

	test('does not close when the event target is inside the menu element', () => {
		const inside_el = document.createElement('span');
		menu_el.appendChild(inside_el);
		const handler = contextmenu_create_mousedown_handler(contextmenu, () => menu_el);

		const event = create_mouse_event('mousedown');
		set_event_target(event, inside_el);
		handler(event);

		assert.strictEqual(contextmenu.opened, true);
	});

	test('is a no-op when the menu element getter returns undefined', () => {
		const handler = contextmenu_create_mousedown_handler(contextmenu, () => undefined);

		const event = create_mouse_event('mousedown');
		set_event_target(event, outside_el);
		handler(event);

		assert.strictEqual(contextmenu.opened, true);
	});
});

describe('contextmenu_open_from_event', () => {
	let contextmenu: ContextmenuState;
	let el: HTMLElement;
	let cleanup: (() => void) | void;

	const test_params = [
		{ snippet: 'text' as const, props: { content: 'Test', icon: '🧪', run: () => undefined } }
	];

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		el = document.createElement('div');
		document.body.appendChild(el);
		cleanup = contextmenu_attachment(test_params)(el);
	});

	afterEach(() => {
		if (cleanup) cleanup();
		el.remove();
	});

	test('opens the menu at event coords plus default offsets and swallows the event', () => {
		const event = create_contextmenu_event(100, 200);
		set_event_target(event, el);

		assert.strictEqual(contextmenu_open_from_event(event, contextmenu, undefined), true);

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.x, 100 + CONTEXTMENU_DEFAULT_OPEN_OFFSET_X);
		assert.strictEqual(contextmenu.y, 200 + CONTEXTMENU_DEFAULT_OPEN_OFFSET_Y);
		assert.strictEqual(contextmenu.target, el);
		assert.strictEqual(event.defaultPrevented, true);
	});

	test('applies custom offsets', () => {
		const event = create_contextmenu_event(100, 200);
		set_event_target(event, el);

		assert.strictEqual(
			contextmenu_open_from_event(event, contextmenu, undefined, {
				open_offset_x: 10,
				open_offset_y: 20
			}),
			true
		);

		assert.strictEqual(contextmenu.x, 110);
		assert.strictEqual(contextmenu.y, 220);
	});

	test('returns false for shift-clicks', () => {
		const event = create_contextmenu_event(100, 200, { shiftKey: true });
		set_event_target(event, el);

		assert.strictEqual(contextmenu_open_from_event(event, contextmenu, undefined), false);

		assert.strictEqual(contextmenu.opened, false);
		assert.strictEqual(event.defaultPrevented, false);
	});

	test('returns false when the target is inside the menu element', () => {
		const menu_el = document.createElement('div');
		document.body.appendChild(menu_el);
		menu_el.appendChild(el); // re-parent the attachment target inside the menu

		const event = create_contextmenu_event(100, 200);
		set_event_target(event, el);

		assert.strictEqual(contextmenu_open_from_event(event, contextmenu, menu_el), false);

		assert.strictEqual(contextmenu.opened, false);
		assert.strictEqual(event.defaultPrevented, false);

		menu_el.remove();
	});
});

describe('ContextmenuOpenGuard', () => {
	let guard: ContextmenuOpenGuard;

	beforeEach(() => {
		guard = new ContextmenuOpenGuard();
	});

	test('guards the release of a gesture that opened the menu', () => {
		guard.touchstart();
		guard.opened();

		const touchend = create_touch_event('touchend', []);
		assert.strictEqual(guard.touchend(touchend), true);
		assert.strictEqual(touchend.defaultPrevented, true);

		// The click blocker is armed and consumes exactly one click.
		assert.strictEqual(guard.consume_blocked_click(), true);
		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('does not guard a release when the menu did not open during the touch', () => {
		guard.touchstart();

		const touchend = create_touch_event('touchend', []);
		assert.strictEqual(guard.touchend(touchend), false);
		assert.strictEqual(touchend.defaultPrevented, false);
		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('does not arm when the menu opens without an active touch', () => {
		// A mouse right-click open - no touchstart preceded it.
		guard.opened();

		const touchend = create_touch_event('touchend', []);
		assert.strictEqual(guard.touchend(touchend), false);
		assert.strictEqual(touchend.defaultPrevented, false);
		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('guards only the opening gesture, not subsequent releases', () => {
		guard.touchstart();
		guard.opened();
		guard.touchend(create_touch_event('touchend', []));
		guard.consume_blocked_click();

		// The next gesture is a normal tap on a menu item.
		guard.touchstart();
		const touchend = create_touch_event('touchend', []);
		assert.strictEqual(guard.touchend(touchend), false);
		assert.strictEqual(touchend.defaultPrevented, false);
	});

	test('touchstart clears a stale armed click blocker', () => {
		guard.touchstart();
		guard.opened();
		guard.touchend(create_touch_event('touchend', []));

		// The blocker is armed but no click arrived - the next gesture clears it.
		guard.touchstart();
		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('reset clears the armed state', () => {
		guard.touchstart();
		guard.opened();
		guard.reset();

		const touchend = create_touch_event('touchend', []);
		assert.strictEqual(guard.touchend(touchend), false);
		assert.strictEqual(touchend.defaultPrevented, false);
		assert.strictEqual(guard.consume_blocked_click(), false);
	});
});

const create_button_event = (
	type: string,
	button: number,
	time_stamp: number,
	init?: { buttons?: number; shiftKey?: boolean }
): MouseEvent => {
	const e = create_mouse_event(type, { bubbles: true, cancelable: true, button, ...init });
	set_event_time(e, time_stamp);
	return e;
};

describe('ContextmenuOpenGuard - gesture causality', () => {
	let guard: ContextmenuOpenGuard;

	beforeEach(() => {
		guard = new ContextmenuOpenGuard();
	});

	test('secondary-button presses always belong to the gesture', () => {
		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 2, 1000)),
			true
		);
	});

	test('a press while the secondary button is held belongs to the gesture', () => {
		// the press's own `buttons` bitmask carries the still-held secondary button
		assert.strictEqual(
			guard.press_belongs_to_open_gesture(
				create_button_event('mousedown', 0, 1022, { buttons: 3 })
			),
			true
		);
	});

	test('a press whose timestamp predates the secondary release belongs to the gesture', () => {
		// The overlap artifact: a tap-style device registers a primary press during the
		// right-click; the compositor serializes delivery after the right button's release,
		// but the hardware timestamps overlap.
		guard.track_mouseup(create_button_event('mouseup', 2, 1074));

		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1022)),
			true
		);
	});

	test('a sequential press after the secondary release is deliberate, however fast', () => {
		guard.track_mouseup(create_button_event('mouseup', 2, 1074));

		// 1ms after the release - a power user's muscle-memory right-then-left click
		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1075)),
			false
		);
	});

	test('non-secondary releases do not set the overlap boundary', () => {
		guard.track_mouseup(create_button_event('mouseup', 0, 1074));

		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1022)),
			false
		);
	});

	test('presses during an active touch belong to the gesture', () => {
		guard.touchstart();

		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1000)),
			true
		);
	});

	test('presses predating the last touch end belong to the gesture', () => {
		guard.touchstart();
		const touchend = create_touch_event('touchend', []);
		set_event_time(touchend, 1100);
		guard.touchend(touchend);

		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1080)),
			true
		);
		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1101)),
			false
		);
	});

	test('a gesture press on the menu blocks the resulting click exactly once', () => {
		guard.track_mouseup(create_button_event('mouseup', 2, 1074));

		guard.mousedown_on_menu(create_button_event('mousedown', 0, 1022));
		assert.strictEqual(guard.consume_blocked_click(), true);
		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('a deliberate press on the menu does not block', () => {
		guard.track_mouseup(create_button_event('mouseup', 2, 1074));

		guard.mousedown_on_menu(create_button_event('mousedown', 0, 1200));
		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('reset clears the click blocker but preserves release tracking', () => {
		guard.track_mouseup(create_button_event('mouseup', 2, 1074));
		guard.mousedown_on_menu(create_button_event('mousedown', 0, 1022));
		guard.reset();

		assert.strictEqual(guard.consume_blocked_click(), false);
		// the release timestamp persists - it mirrors hardware history, not gesture state
		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 1050)),
			true
		);
	});

	test('a press after an unresolved right-click still reads as deliberate', () => {
		// The native menu's pointer grab swallowed the secondary release (and in
		// Firefox, shift+rightclick suppresses the `contextmenu` event too) - nothing
		// was tracked, and the next press's own `buttons` shows the button is up.
		guard.mousedown_on_menu(create_button_event('mousedown', 2, 1000, { buttons: 2 }));

		assert.strictEqual(
			guard.press_belongs_to_open_gesture(
				create_button_event('mousedown', 0, 5000, { buttons: 1 })
			),
			false
		);
	});

	test('a non-primary gesture press on the menu does not arm the click blocker', () => {
		// a right-press on the menu produces no `click` - arming would leave the
		// blocker to eat the next deliberate click on an entry
		guard.mousedown_on_menu(create_button_event('mousedown', 2, 1000, { buttons: 2 }));

		assert.strictEqual(guard.consume_blocked_click(), false);
	});

	test('a partial release of a multi-touch keeps the gesture active', () => {
		guard.touchstart();

		// one finger lifts while another remains down
		const partial = create_touch_event('touchend', [{ clientX: 0, clientY: 0 }]);
		set_event_time(partial, 1000);
		guard.touchend(partial);

		// a press during the remaining touch still belongs to the gesture
		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 2000)),
			true
		);

		// the final release ends the gesture
		const final_release = create_touch_event('touchend', []);
		set_event_time(final_release, 3000);
		guard.touchend(final_release);

		assert.strictEqual(
			guard.press_belongs_to_open_gesture(create_button_event('mousedown', 0, 3001)),
			false
		);
	});
});

describe('contextmenu_resolve_contextmenu_event', () => {
	let contextmenu: ContextmenuState;
	let open_guard: ContextmenuOpenGuard;
	let target: HTMLElement;
	let menu_el: HTMLElement;
	let cleanup: (() => void) | void;

	const test_params = [
		{ snippet: 'text' as const, props: { content: 'Test', icon: '🧪', run: () => undefined } }
	];

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		open_guard = new ContextmenuOpenGuard();
		target = document.createElement('div');
		document.body.appendChild(target);
		cleanup = contextmenu_attachment(test_params)(target);
		menu_el = document.createElement('ul');
		document.body.appendChild(menu_el);
	});

	afterEach(() => {
		if (cleanup) cleanup();
		target.remove();
		menu_el.remove();
	});

	const dispatch = (event_target: EventTarget, time: number, shift = false): boolean => {
		const e = create_contextmenu_event(100, 100, { shiftKey: shift });
		set_event_target(e, event_target);
		set_event_time(e, time);
		return contextmenu_resolve_contextmenu_event(e, contextmenu, menu_el, open_guard);
	};

	test('opens the menu from a valid target', () => {
		assert.strictEqual(dispatch(target, 1000), true);
		assert.strictEqual(contextmenu.opened, true);
	});

	test('a right-click on another valid target reopens there', () => {
		assert.strictEqual(dispatch(target, 1000), true);
		assert.strictEqual(contextmenu.target, target);

		const target_2 = document.createElement('div');
		document.body.appendChild(target_2);
		const cleanup_2 = contextmenu_attachment(test_params)(target_2);

		assert.strictEqual(dispatch(target_2, 2000), true);
		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.target, target_2);

		cleanup_2?.();
		target_2.remove();
	});

	test('an unhandled right-click outside the open menu closes it for the native menu', () => {
		assert.strictEqual(dispatch(target, 1000), true);

		// shift bypasses ours, so the native menu shows instead
		assert.strictEqual(dispatch(target, 2000, true), false);
		assert.strictEqual(contextmenu.opened, false);
	});

	// Reproduces right-clicking the open menu: the native contextmenu shows over ours,
	// and its pointer grab swallows the secondary button's release on platforms where
	// it opens on mousedown. With no release ever delivered, dismissal must rely on the
	// next press's own `buttons` state - tracked-flag bookkeeping wedged stuck here.
	test('right-click on the menu keeps it open and a later press still dismisses', () => {
		const mousedown = contextmenu_create_mousedown_handler(contextmenu, () => menu_el, open_guard);

		// the opening right-click: contextmenu (swallowed, ours opens), release
		assert.strictEqual(dispatch(target, 1000), true);
		open_guard.track_mouseup(create_button_event('mouseup', 2, 1050));

		// right-click ON the menu: ours stays open, the native menu shows,
		// and its release is never delivered
		const entry = document.createElement('li');
		menu_el.appendChild(entry);
		const right_press = create_button_event('mousedown', 2, 2000, { buttons: 2 });
		set_event_target(right_press, entry);
		mousedown(right_press);
		assert.strictEqual(dispatch(entry, 2000), false);
		assert.strictEqual(contextmenu.opened, true);
		// the right-press produced no `click`, so it must not arm the click blocker -
		// the next deliberate click on an entry has to activate it
		assert.strictEqual(open_guard.consume_blocked_click(), false);

		// a later primary press outside dismisses normally
		const press = create_button_event('mousedown', 0, 3000, { buttons: 1 });
		set_event_target(press, target);
		mousedown(press);
		assert.strictEqual(contextmenu.opened, false);
	});

	// In Firefox, shift+rightclick never fires a `contextmenu` event at all (a
	// user-agency feature guaranteeing the native menu), so the gesture can't resolve
	// in the roots' handlers - the press itself must close the menu.
	test('shift+rightclick outside the open menu closes it on the press', () => {
		const mousedown = contextmenu_create_mousedown_handler(contextmenu, () => menu_el, open_guard);

		assert.strictEqual(dispatch(target, 1000), true);
		open_guard.track_mouseup(create_button_event('mouseup', 2, 1050));

		const press = create_button_event('mousedown', 2, 2000, { buttons: 2, shiftKey: true });
		set_event_target(press, target);
		mousedown(press);
		assert.strictEqual(contextmenu.opened, false);
	});

	test('shift+rightclick on the menu itself does not close it', () => {
		const mousedown = contextmenu_create_mousedown_handler(contextmenu, () => menu_el, open_guard);

		assert.strictEqual(dispatch(target, 1000), true);
		open_guard.track_mouseup(create_button_event('mouseup', 2, 1050));

		const entry = document.createElement('li');
		menu_el.appendChild(entry);
		const press = create_button_event('mousedown', 2, 2000, { buttons: 2, shiftKey: true });
		set_event_target(press, entry);
		mousedown(press);
		assert.strictEqual(contextmenu.opened, true);
	});
});

describe('contextmenu_resolve_popover_host', () => {
	test('returns null for an undefined target', () => {
		assert.strictEqual(contextmenu_resolve_popover_host(undefined), null);
	});

	test('returns null when the target has no modal dialog ancestor', () => {
		const dialog = document.createElement('dialog');
		const target = document.createElement('div');
		dialog.appendChild(target);
		document.body.appendChild(dialog);

		// jsdom dialogs never match `:modal`, the same as a closed or non-modal dialog
		assert.strictEqual(contextmenu_resolve_popover_host(target), null);

		dialog.remove();
	});

	test('returns the modal dialog containing the target', () => {
		const dialog = document.createElement('dialog');
		const target = document.createElement('div');
		dialog.appendChild(target);
		// jsdom can't enter the modal state, so stub the selector match
		const closest = vi.spyOn(target, 'closest').mockReturnValue(dialog);

		assert.strictEqual(contextmenu_resolve_popover_host(target), dialog);
		assert.strictEqual(closest.mock.calls[0]?.[0], 'dialog:modal');
	});
});

describe('contextmenu_popover_attachment', () => {
	let contextmenu: ContextmenuState;
	let el: HTMLElement;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		el = document.createElement('ul');
		document.body.appendChild(el);
	});

	afterEach(() => {
		el.remove();
	});

	test('no-ops without the Popover API', () => {
		// jsdom has no `showPopover`, exercising the fallback path
		assert.strictEqual(el.showPopover, undefined);

		const cleanup = contextmenu_popover_attachment(contextmenu)(el);

		assert.strictEqual(cleanup, undefined);
		assert.strictEqual(el.parentNode, document.body);
	});

	test('shows the popover in place when the target has no modal dialog host', () => {
		const show_popover = vi.fn();
		el.showPopover = show_popover;

		contextmenu_popover_attachment(contextmenu)(el);

		assert.strictEqual(show_popover.mock.calls.length, 1);
		assert.strictEqual(el.parentNode, document.body);
	});

	test('does not call showPopover again when the popover is already shown', () => {
		// the attachment re-runs when the `contextmenu` prop changes identity -
		// `showPopover()` throws on an already-shown popover
		const show_popover = vi.fn();
		el.showPopover = show_popover;
		vi.spyOn(el, 'matches').mockReturnValue(true);

		contextmenu_popover_attachment(contextmenu)(el);

		assert.strictEqual(show_popover.mock.calls.length, 0);
	});

	test('reparents into the modal dialog before showing and closes the menu with it', () => {
		const dialog = document.createElement('dialog');
		document.body.appendChild(dialog);
		const target = document.createElement('div');
		dialog.appendChild(target);
		vi.spyOn(target, 'closest').mockReturnValue(dialog);
		contextmenu.open([], 0, 0, target);

		let parent_when_shown: ParentNode | null | undefined;
		el.showPopover = () => {
			parent_when_shown = el.parentNode;
		};

		const cleanup = contextmenu_popover_attachment(contextmenu)(el);

		// reparented before `showPopover` - moving a shown popover would hide it
		assert.strictEqual(parent_when_shown, dialog);
		assert.strictEqual(el.parentNode, dialog);

		// the host dialog closing closes the menu
		assert.strictEqual(contextmenu.opened, true);
		dialog.dispatchEvent(new Event('close'));
		assert.strictEqual(contextmenu.opened, false);

		assert.ok(cleanup);
		cleanup();
		dialog.remove();
	});

	test('cleanup unsubscribes from the host dialog close event', () => {
		const dialog = document.createElement('dialog');
		document.body.appendChild(dialog);
		const target = document.createElement('div');
		dialog.appendChild(target);
		vi.spyOn(target, 'closest').mockReturnValue(dialog);
		contextmenu.open([], 0, 0, target);
		el.showPopover = vi.fn();

		const cleanup = contextmenu_popover_attachment(contextmenu)(el);
		assert.ok(cleanup);
		cleanup();

		dialog.dispatchEvent(new Event('close'));
		assert.strictEqual(contextmenu.opened, true);

		dialog.remove();
	});
});
