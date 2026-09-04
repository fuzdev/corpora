/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';

import { create_shared_edge_case_tests } from './contextmenu_test_edge_cases.ts';
import ContextmenuRoot from '$lib/ContextmenuRoot.svelte';
import { contextmenu_attachment } from '$lib/contextmenu_state.svelte.ts';
import {
	unmount_component,
	create_contextmenu_event,
	create_keyboard_event,
	create_mouse_event,
	create_touch_event,
	set_event_target,
	set_event_time
} from './test_helpers.ts';
import { mount_contextmenu_root } from './contextmenu_test_helpers.ts';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

create_shared_edge_case_tests(ContextmenuRoot, 'ContextmenuRoot');

describe('ContextmenuRoot - Reopen While Open', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
	});

	/**
	 * Sets up two contextmenu targets with different text-entry params and opens
	 * the menu from the first one.
	 */
	const mount_and_open_first_target = () => {
		mounted = mount_contextmenu_root(ContextmenuRoot);
		const { container, contextmenu } = mounted;

		const target_a = document.createElement('div');
		container.appendChild(target_a);
		const cleanup_a = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'A1', icon: '🍎', run: () => undefined } },
			{ snippet: 'text' as const, props: { content: 'A2', icon: '🍎', run: () => undefined } }
		])(target_a);

		const target_b = document.createElement('div');
		container.appendChild(target_b);
		const cleanup_b = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'B1', icon: '🍌', run: () => undefined } },
			{ snippet: 'text' as const, props: { content: 'B2', icon: '🍌', run: () => undefined } },
			{ snippet: 'text' as const, props: { content: 'B3', icon: '🍌', run: () => undefined } }
		])(target_b);

		// Open from the first target - its entries mount and register in root_menu.items.
		const event_a = create_contextmenu_event(100, 100);
		set_event_target(event_a, target_a);
		window.dispatchEvent(event_a);
		flushSync();

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.root_menu.items.length, 2);

		const open_second_target = () => {
			const event_b = create_contextmenu_event(200, 200);
			set_event_target(event_b, target_b);
			window.dispatchEvent(event_b);
			flushSync();
		};

		const cleanup = () => {
			cleanup_a?.();
			cleanup_b?.();
			target_a.remove();
			target_b.remove();
		};

		return { contextmenu, open_second_target, cleanup };
	};

	// Guards the interleaved add/destroy case: when the keyed each replaces entries
	// within a single batch, the destroyed entries' teardowns must remove only
	// themselves without losing concurrently-registered entries
	// (see `ContextmenuItemsState`'s non-reactive source array).
	test('reopening while open replaces root_menu items with the new entries', () => {
		const { contextmenu, open_second_target, cleanup } = mount_and_open_first_target();

		// While still open, open again from the other target with different params.
		open_second_target();

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.params.length, 3);
		// The destroyed entries' onDestroy must remove only themselves from items,
		// not lose any of the freshly mounted ones.
		assert.strictEqual(contextmenu.root_menu.items.length, 3);

		cleanup();
	});

	// Reopening from the same target reuses the registered params (same identities),
	// so this guards both layers that prevent a ghost highlight: `open()` deselects
	// the previous selection, and the keyed menu remounts entries with fresh state.
	test('reopening from the same target discards the previous selection highlight', () => {
		mounted = mount_contextmenu_root(ContextmenuRoot);
		const { container, contextmenu } = mounted;

		const target = document.createElement('div');
		container.appendChild(target);
		const cleanup = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'A1', icon: '🍎', run: () => undefined } },
			{ snippet: 'text' as const, props: { content: 'A2', icon: '🍎', run: () => undefined } }
		])(target);

		const open_from_target = (x: number, y: number) => {
			const event = create_contextmenu_event(x, y);
			set_event_target(event, target);
			window.dispatchEvent(event);
			flushSync();
		};

		open_from_target(100, 100);
		assert.strictEqual(contextmenu.opened, true);

		// select the first item via keyboard
		window.dispatchEvent(create_keyboard_event('ArrowDown'));
		flushSync();
		assert.ok(container.querySelector('.contextmenu .selected'));

		// while still open, right-click the same target again
		open_from_target(200, 200);

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.selections.length, 0);
		// no ghost highlight from the previous open
		assert.strictEqual(container.querySelector('.contextmenu .selected'), null);

		cleanup?.();
		target.remove();
	});

	test('reopening after close mounts exactly the new entries', () => {
		const { contextmenu, open_second_target, cleanup } = mount_and_open_first_target();

		// Close first (the realistic mouse flow closes via mousedown before reopening).
		contextmenu.close();
		flushSync();
		assert.strictEqual(contextmenu.root_menu.items.length, 0);

		open_second_target();

		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.params.length, 3);
		assert.strictEqual(contextmenu.root_menu.items.length, 3);

		cleanup();
	});
});

describe('ContextmenuRoot - Synthesized Click After Touch Open', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	afterEach(async () => {
		vi.useRealTimers();
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
	});

	// On touch devices this root opens from the native longpress `contextmenu` event;
	// the release of that same gesture must not interact with the menu - an unprevented
	// `touchend` lets the browser synthesize a `click` at the touch point, which the open
	// offsets place on the first menu item (see `ContextmenuOpenGuard`).
	test('touch-opened menu does not activate the first item on release', () => {
		vi.useFakeTimers();
		mounted = mount_contextmenu_root(ContextmenuRoot);
		// Touch listeners attach via Svelte's microtask queue - drain it before dispatching.
		flushSync();
		const { container, contextmenu } = mounted;

		let activated = false;
		const target = document.createElement('div');
		container.appendChild(target);
		const cleanup = contextmenu_attachment([
			{
				snippet: 'text' as const,
				props: {
					content: 'First',
					icon: '🧪',
					run: () => {
						activated = true;
					}
				}
			}
		])(target);

		// The opening gesture: finger down, the native `contextmenu` fires during the hold.
		const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
		set_event_target(touchstart, target);
		window.dispatchEvent(touchstart);

		const contextmenu_event = create_contextmenu_event(100, 200);
		set_event_target(contextmenu_event, target);
		window.dispatchEvent(contextmenu_event);
		flushSync();
		assert.strictEqual(contextmenu.opened, true);

		// The release of the same gesture.
		const touchend = create_touch_event('touchend', []);
		set_event_target(touchend, target);
		window.dispatchEvent(touchend);

		// When `touchend` isn't `preventDefault`ed, the browser synthesizes compatibility
		// mouse events at the touch point - the open offsets put the first item there.
		if (!touchend.defaultPrevented) {
			const item = container.querySelector('.contextmenu [role="menuitem"]');
			assert.ok(item);
			const click = create_mouse_event('click', { bubbles: true, cancelable: true });
			set_event_target(click, item);
			item.dispatchEvent(click);
		}

		// Entry activation defers through a timeout.
		vi.runAllTimers();
		flushSync();

		assert.strictEqual(activated, false, 'the opening release must not activate the first item');
		assert.strictEqual(contextmenu.opened, true, 'menu should stay open after the opening release');

		cleanup?.();
		target.remove();
	});
});

describe('ContextmenuRoot - Blocked Click After Touch Open', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	afterEach(async () => {
		vi.useRealTimers();
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
	});

	// iOS can synthesize the click even when the opening gesture's `touchend` is
	// swallowed - the menu's click capture handler blocks that first click.
	test('click synthesized despite the swallowed release is blocked', () => {
		vi.useFakeTimers();
		mounted = mount_contextmenu_root(ContextmenuRoot);
		// Touch listeners attach via Svelte's microtask queue - drain it before dispatching.
		flushSync();
		const { container, contextmenu } = mounted;

		let activated = false;
		const target = document.createElement('div');
		container.appendChild(target);
		const cleanup = contextmenu_attachment([
			{
				snippet: 'text' as const,
				props: {
					content: 'First',
					icon: '🧪',
					run: () => {
						activated = true;
					}
				}
			}
		])(target);

		const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
		set_event_target(touchstart, target);
		window.dispatchEvent(touchstart);

		const contextmenu_event = create_contextmenu_event(100, 200);
		set_event_target(contextmenu_event, target);
		window.dispatchEvent(contextmenu_event);
		flushSync();
		assert.strictEqual(contextmenu.opened, true);

		const touchend = create_touch_event('touchend', []);
		set_event_target(touchend, target);
		window.dispatchEvent(touchend);
		assert.strictEqual(touchend.defaultPrevented, true, 'the opening release is swallowed');

		// iOS-style: the click arrives anyway.
		const item = container.querySelector('.contextmenu [role="menuitem"]');
		assert.ok(item);
		const click = create_mouse_event('click', { bubbles: true, cancelable: true });
		set_event_target(click, item);
		item.dispatchEvent(click);
		assert.strictEqual(click.defaultPrevented, true, 'the synthesized click is blocked');

		vi.runAllTimers();
		flushSync();

		assert.strictEqual(activated, false);
		assert.strictEqual(contextmenu.opened, true);

		// The blocker consumes exactly one click - the next click activates normally.
		const second_click = create_mouse_event('click', { bubbles: true, cancelable: true });
		set_event_target(second_click, item);
		item.dispatchEvent(second_click);
		vi.runAllTimers();
		flushSync();
		assert.strictEqual(activated, true, 'subsequent clicks activate normally');

		cleanup?.();
		target.remove();
	});
});

describe('ContextmenuRoot - Reopen Gesture Ordering', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	afterEach(async () => {
		vi.useRealTimers();
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
	});

	const setup = () => {
		vi.useFakeTimers();
		mounted = mount_contextmenu_root(ContextmenuRoot);
		flushSync();
		const { container, contextmenu } = mounted;
		const target_a = document.createElement('div');
		container.appendChild(target_a);
		const cleanup_a = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'A', icon: '🍎', run: () => undefined } }
		])(target_a);
		const target_b = document.createElement('div');
		container.appendChild(target_b);
		const cleanup_b = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'B', icon: '🍌', run: () => undefined } }
		])(target_b);
		const dispatch = (e: Event, target: Element, flush = true, time_stamp?: number) => {
			if (time_stamp !== undefined) set_event_time(e, time_stamp);
			set_event_target(e, target);
			window.dispatchEvent(e);
			if (flush) flushSync();
		};
		return {
			contextmenu,
			target_a,
			target_b,
			dispatch,
			cleanup: () => {
				cleanup_a?.();
				cleanup_b?.();
				target_a.remove();
				target_b.remove();
			}
		};
	};

	test('reopens when the gesture mousedown precedes the contextmenu event', () => {
		const { contextmenu, target_a, target_b, dispatch, cleanup } = setup();
		dispatch(create_contextmenu_event(100, 100), target_a, true, 1000);
		assert.strictEqual(contextmenu.opened, true);

		// Secondary-button presses never close via the mousedown handler -
		// the gesture's own contextmenu event resolves the menu by reopening it.
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 2 }),
			target_b,
			true,
			1500
		);
		assert.strictEqual(contextmenu.opened, true);
		dispatch(create_contextmenu_event(300, 300), target_b, true, 1500);

		vi.runAllTimers();
		flushSync();
		assert.strictEqual(contextmenu.opened, true);
		assert.strictEqual(contextmenu.x, 298); // reopened at the new spot
		cleanup();
	});

	test('stays open when the gesture mousedown arrives after the contextmenu event', () => {
		const { contextmenu, target_a, target_b, dispatch, cleanup } = setup();
		dispatch(create_contextmenu_event(100, 100), target_a, true, 1000);
		assert.strictEqual(contextmenu.opened, true);

		// Same-burst ordering (synthesized longpress bursts; platform variations):
		// the contextmenu event reopens at B, then the gesture's own mousedown is
		// dispatched before the menu re-renders under the pointer - it must not close
		// the menu it just opened (see `ContextmenuOpenGuard.press_belongs_to_open_gesture`).
		dispatch(create_contextmenu_event(300, 300), target_b, false, 1500);
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 2 }),
			target_b,
			false,
			1505
		);
		flushSync();

		assert.strictEqual(contextmenu.opened, true);
		cleanup();
	});

	test('a later outside press still closes the reopened menu', () => {
		const { contextmenu, target_a, target_b, dispatch, cleanup } = setup();
		dispatch(create_contextmenu_event(100, 100), target_a, true, 1000);
		dispatch(create_contextmenu_event(300, 300), target_b, false, 1500);
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 2 }),
			target_b,
			false,
			1505
		);
		flushSync();
		assert.strictEqual(contextmenu.opened, true);

		// the right button releases, completing the opening gesture
		dispatch(
			create_mouse_event('mouseup', { bubbles: true, cancelable: true, button: 2 }),
			target_b,
			true,
			1550
		);

		// a sequential press after the release closes normally - however fast
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true }),
			target_a,
			true,
			1551
		);
		assert.strictEqual(contextmenu.opened, false);
		cleanup();
	});

	test('touch longpress reopen survives a reversed synthesized burst', () => {
		const { contextmenu, target_a, target_b, dispatch, cleanup } = setup();
		// first longpress open at A
		dispatch(
			create_touch_event('touchstart', [{ clientX: 100, clientY: 100, target: target_a }]),
			target_a
		);
		dispatch(create_contextmenu_event(100, 100), target_a);
		assert.strictEqual(contextmenu.opened, true);
		dispatch(create_touch_event('touchend', []), target_a);

		// quick second longpress at B with the contextmenu before the synthesized mousedown
		dispatch(
			create_touch_event('touchstart', [{ clientX: 300, clientY: 300, target: target_b }]),
			target_b
		);
		dispatch(create_contextmenu_event(300, 300), target_b, false, 1500);
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 0 }),
			target_b,
			false,
			1510
		);
		flushSync();
		dispatch(create_touch_event('touchend', []), target_b);

		vi.runAllTimers();
		flushSync();
		assert.strictEqual(contextmenu.opened, true);
		cleanup();
	});

	test('shift+rightclick closes the open menu on the press', () => {
		const { contextmenu, target_a, target_b, dispatch, cleanup } = setup();
		dispatch(create_contextmenu_event(100, 100), target_a, true, 1000);
		assert.strictEqual(contextmenu.opened, true);

		// Firefox never fires `contextmenu` for shift+rightclick, so the press itself
		// must close the menu for the native menu.
		dispatch(
			create_mouse_event('mousedown', {
				bubbles: true,
				cancelable: true,
				button: 2,
				buttons: 2,
				shiftKey: true
			}),
			target_b,
			true,
			1500
		);
		assert.strictEqual(contextmenu.opened, false);
		cleanup();
	});

	test('dismissal survives a right-click whose release the native menu swallowed', () => {
		const { contextmenu, target_a, target_b, dispatch, cleanup } = setup();
		dispatch(create_contextmenu_event(100, 100), target_a, true, 1000);
		assert.strictEqual(contextmenu.opened, true);

		// Right-click ON the open menu: the native menu shows over ours, and its
		// pointer grab eats the right button's mouseup - the page never sees the release.
		const menu = document.querySelector('.contextmenu');
		assert.ok(menu);
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 2, buttons: 2 }),
			menu,
			true,
			1500
		);
		dispatch(create_contextmenu_event(300, 300), menu, true, 1500);
		assert.strictEqual(contextmenu.opened, true);

		// the next primary press dismisses - no stale tracked state to wedge
		dispatch(
			create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }),
			target_b,
			true,
			3000
		);
		assert.strictEqual(contextmenu.opened, false);
		cleanup();
	});
});

describe('ContextmenuRoot - Overlapping Press On Open', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	afterEach(async () => {
		vi.useRealTimers();
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
	});

	// Reproduces a tap-style input device registering an overlapping left-button press
	// during the right-click that opened the menu: the press's hardware timestamp falls
	// within the opening gesture, it's delivered after the menu opened, and it lands on
	// the first item because the open offsets place it under the pointer. Its click must
	// not activate the entry (see `ContextmenuOpenGuard.mousedown_on_menu`).
	test('a click from a press overlapping the opening gesture does not activate the first item', () => {
		vi.useFakeTimers();
		mounted = mount_contextmenu_root(ContextmenuRoot);
		flushSync();
		const { container, contextmenu } = mounted;

		let activated = false;
		const target = document.createElement('div');
		container.appendChild(target);
		const cleanup = contextmenu_attachment([
			{
				snippet: 'text' as const,
				props: {
					content: 'First',
					icon: '🧪',
					run: () => {
						activated = true;
					}
				}
			}
		])(target);

		// the opening right-click: press, contextmenu, release
		const right_down = create_mouse_event('mousedown', {
			bubbles: true,
			cancelable: true,
			button: 2
		});
		set_event_time(right_down, 1000);
		set_event_target(right_down, target);
		window.dispatchEvent(right_down);

		const ctx = create_contextmenu_event(100, 100);
		set_event_time(ctx, 1000);
		set_event_target(ctx, target);
		window.dispatchEvent(ctx);
		flushSync();
		assert.strictEqual(contextmenu.opened, true);

		const right_up = create_mouse_event('mouseup', { bubbles: true, cancelable: true, button: 2 });
		set_event_time(right_up, 1074);
		set_event_target(right_up, target);
		window.dispatchEvent(right_up);

		const item = container.querySelector('.contextmenu [role="menuitem"]');
		assert.ok(item);

		// The overlapping press: its hardware timestamp (1022) falls inside the right
		// press (1000-1074); the compositor delivers it after the release,
		// landing on the first item under the pointer.
		const md = create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 0 });
		set_event_time(md, 1022);
		set_event_target(md, item);
		window.dispatchEvent(md);

		const click = create_mouse_event('click', { bubbles: true, cancelable: true });
		set_event_time(click, 1106);
		set_event_target(click, item);
		item.dispatchEvent(click);
		assert.strictEqual(click.defaultPrevented, true, 'the gesture click is blocked');

		vi.runAllTimers();
		flushSync();
		assert.strictEqual(activated, false, 'the overlapping press must not activate the entry');
		assert.strictEqual(contextmenu.opened, true);

		// a later deliberate press and click activates normally
		const md2 = create_mouse_event('mousedown', { bubbles: true, cancelable: true, button: 0 });
		set_event_time(md2, 1400);
		set_event_target(md2, item);
		window.dispatchEvent(md2);

		const click2 = create_mouse_event('click', { bubbles: true, cancelable: true });
		set_event_time(click2, 1480);
		set_event_target(click2, item);
		item.dispatchEvent(click2);

		vi.runAllTimers();
		flushSync();
		assert.strictEqual(activated, true, 'later clicks activate normally');

		cleanup?.();
		target.remove();
	});
});

describe('ContextmenuRoot - Contextmenu On Entryless Target', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
	});

	// Secondary-button presses don't close via the mousedown handler, so the
	// contextmenu event resolves the gesture: right-clicking where there's nothing
	// to open closes our menu and lets the system contextmenu show.
	test('right-clicking a target with no entries closes the open menu', () => {
		mounted = mount_contextmenu_root(ContextmenuRoot);
		flushSync();
		const { container, contextmenu } = mounted;

		const target = document.createElement('div');
		container.appendChild(target);
		const cleanup = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'A', icon: '🍎', run: () => undefined } }
		])(target);
		const bare = document.createElement('div');
		container.appendChild(bare);

		const ctx_a = create_contextmenu_event(100, 100);
		set_event_target(ctx_a, target);
		window.dispatchEvent(ctx_a);
		flushSync();
		assert.strictEqual(contextmenu.opened, true);

		const ctx_bare = create_contextmenu_event(300, 300);
		set_event_target(ctx_bare, bare);
		window.dispatchEvent(ctx_bare);
		flushSync();

		assert.strictEqual(contextmenu.opened, false);
		// the system contextmenu is allowed through
		assert.strictEqual(ctx_bare.defaultPrevented, false);

		cleanup?.();
		target.remove();
		bare.remove();
	});
});
