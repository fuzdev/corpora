/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, tick } from 'svelte';

import ContextmenuRootForSafariCompatibility from '$lib/ContextmenuRootForSafariCompatibility.svelte';
import {
	unmount_component,
	create_touch_event,
	create_mouse_event,
	create_contextmenu_event,
	set_event_target
} from './test_helpers.ts';
import {
	mount_contextmenu_root,
	setup_contextmenu_attachment
} from './contextmenu_test_helpers.ts';
import {
	CONTEXTMENU_DEFAULT_LONGPRESS_DURATION,
	CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE
} from '$lib/contextmenu_helpers.ts';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('ContextmenuRootForSafariCompatibility - Touch Event Handling', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
		vi.useRealTimers();
	});

	describe('longpress detection', () => {
		test('starts longpress timer on touchstart', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			const event = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(event, target);

			window.dispatchEvent(event);

			// Menu should not be open yet
			assert.strictEqual(contextmenu.opened, false);

			// But timeout should be started - we can't directly observe this,
			// but advancing time will prove it
			// Advance partway through longpress duration
			vi.advanceTimersByTime(100);
			assert.strictEqual(contextmenu.opened, false); // Still not open

			// Complete the remaining longpress duration
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION - 100);
			await tick();

			// Now it should be open
			assert.strictEqual(contextmenu.opened, true);
		});

		test('opens menu after longpress_duration elapses', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_duration: 300
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			const event = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(event, target);

			window.dispatchEvent(event);

			assert.strictEqual(contextmenu.opened, false);

			// Advance to custom longpress_duration (300ms)
			vi.advanceTimersByTime(300);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.x, 98); // 100 + offset (-2)
			assert.strictEqual(contextmenu.y, 198); // 200 + offset (-2)
		});

		test('cancels longpress on touchmove beyond tolerance', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_move_tolerance: 10
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move beyond tolerance (11 pixels)
			const touchmove = create_touch_event('touchmove', [{ clientX: 111, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// Advance past longpress duration - should not open due to movement
			vi.advanceTimersByTime(500);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('allows longpress with movement within tolerance', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_move_tolerance: 10,
				longpress_duration: 300
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move within tolerance (5 pixels)
			const touchmove = create_touch_event('touchmove', [{ clientX: 105, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// Advance to custom longpress_duration (300ms) - should open despite movement
			vi.advanceTimersByTime(300);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('cancels longpress on touchend before timeout', async () => {
			const { container, contextmenu } = (mounted = mount_contextmenu_root(
				ContextmenuRootForSafariCompatibility
			));

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// End touch before timeout (200ms into longpress)
			vi.advanceTimersByTime(200);
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);

			// Advance remaining time past when it would have opened
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION - 200 + 100);
			await tick();

			// Should not open
			assert.strictEqual(contextmenu.opened, false);
		});

		test('ignores touchstart when contextmenu already open', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu manually
			contextmenu.open(
				[{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }],
				150,
				250
			);
			flushSync();

			// Try touchstart
			const event = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(event, target);
			window.dispatchEvent(event);

			// Advance past longpress duration - position should remain unchanged
			vi.advanceTimersByTime(500);
			await tick();

			assert.strictEqual(contextmenu.x, 150);
			assert.strictEqual(contextmenu.y, 250);
		});

		test('ignores touchstart with multiple touches', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Two-finger touch
			const event = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target },
				{ clientX: 150, clientY: 250, target }
			]);
			set_event_target(event, target);
			window.dispatchEvent(event);

			// Should not start longpress with multiple touches
			vi.advanceTimersByTime(500);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('ignores touchstart on editable elements', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const input = document.createElement('input');
			container.appendChild(input);

			const event = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target: input }
			]);
			set_event_target(event, input);
			window.dispatchEvent(event);

			// Should not start longpress on editable elements
			vi.advanceTimersByTime(500);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('preserves touch coordinates for menu positioning', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			const event = create_touch_event('touchstart', [{ clientX: 123, clientY: 456, target }]);
			set_event_target(event, target);
			window.dispatchEvent(event);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Menu should be at touch coordinates with offset
			assert.strictEqual(contextmenu.x, 121); // 123 - 2
			assert.strictEqual(contextmenu.y, 454); // 456 - 2
		});
	});

	describe('native contextmenu interaction', () => {
		test('swallows native contextmenu event when longpress already opened menu', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Simulate longpress opening the menu
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
			const initial_x = contextmenu.x;
			const initial_y = contextmenu.y;

			// Now browser fires contextmenu event
			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			// Should be prevented and position unchanged
			assert.strictEqual(ctxmenu.defaultPrevented, true);
			assert.strictEqual(contextmenu.x, initial_x);
			assert.strictEqual(contextmenu.y, initial_y);
		});

		test('handles native contextmenu firing before custom longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_duration: 600 // Longer than browser's ~500ms
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Browser fires contextmenu at ~500ms (before our 600ms custom longpress)
			vi.advanceTimersByTime(500);
			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			// Should open from contextmenu event
			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(ctxmenu.defaultPrevented, true);

			// Our longpress timeout should not reopen it (complete to 600ms total)
			vi.advanceTimersByTime(100);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('handles native contextmenu firing after custom longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_duration: 400 // Shorter than browser's ~500ms
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Our custom longpress opens at 400ms (before browser's ~500ms)
			vi.advanceTimersByTime(400);
			await tick();
			assert.strictEqual(contextmenu.opened, true);

			// Browser fires contextmenu later at ~500ms (100ms after our longpress)
			vi.advanceTimersByTime(100);
			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			// Should be swallowed
			assert.strictEqual(ctxmenu.defaultPrevented, true);
			assert.strictEqual(contextmenu.opened, true);
		});

		test('resets state when native contextmenu opens menu', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Browser fires contextmenu (e.g., from right-click on desktop)
			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			assert.strictEqual(contextmenu.opened, true);

			// Now close it
			contextmenu.close();

			// Start a new touch - should work normally
			const touchstart = create_touch_event('touchstart', [{ clientX: 150, clientY: 250, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.x, 148); // 150 - 2
			assert.strictEqual(contextmenu.y, 248); // 250 - 2
		});
	});

	describe('touchend behavior', () => {
		test('prevents clicking first item when menu just opened from longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			let clicked = false;
			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => (clicked = true) } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Wait for longpress
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);

			// Touchend immediately after - should be swallowed
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);

			// Should not have clicked
			assert.strictEqual(clicked, false);
			assert.strictEqual(touchend.defaultPrevented, true);
		});

		test('clears longpress timeout on touchend', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// End touch before longpress completes
			vi.advanceTimersByTime(200);
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);

			// Continue advancing past when longpress would have triggered
			vi.advanceTimersByTime(500);
			await tick();

			// Should not open
			assert.strictEqual(contextmenu.opened, false);
		});

		test('preserves tap tracking state for bypass detection', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// First tap
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// First tap duration (short tap)
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap quickly after first tap ends (total 200ms, within bypass window)
			vi.advanceTimersByTime(100);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// This should trigger bypass, so longpress should not open menu
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, false);

			// But contextmenu event should be allowed through (bypass)
			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			// Bypass means event is NOT prevented
			assert.strictEqual(ctxmenu.defaultPrevented, false);
		});
	});

	describe('touchcancel behavior', () => {
		test('resets all longpress state on touchcancel', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Cancel touch partway through longpress
			vi.advanceTimersByTime(200);
			const touchcancel = create_touch_event('touchcancel', []);
			set_event_target(touchcancel, target);
			window.dispatchEvent(touchcancel);

			// Advance past when longpress would have triggered
			vi.advanceTimersByTime(500);
			await tick();

			// Should not open
			assert.strictEqual(contextmenu.opened, false);
		});

		test('clears bypass flag on touchcancel', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// First tap
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// First tap duration (short tap)
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap starts (total 200ms from first tap, within bypass window)
			vi.advanceTimersByTime(100);
			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// This sets bypass flag internally

			// Now cancel
			const touchcancel = create_touch_event('touchcancel', []);
			set_event_target(touchcancel, target);
			window.dispatchEvent(touchcancel);

			// Try contextmenu - should open normally (bypass cleared)
			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(ctxmenu.defaultPrevented, true);
		});

		test('handles touchcancel during longpress timeout', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Cancel partway through longpress (300ms into default 500ms)
			vi.advanceTimersByTime(300);
			const touchcancel = create_touch_event('touchcancel', []);
			set_event_target(touchcancel, target);
			window.dispatchEvent(touchcancel);

			// Complete the would-be timeout (to 500ms total)
			vi.advanceTimersByTime(200);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('handles touchcancel after menu opened', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu via longpress
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			assert.strictEqual(contextmenu.opened, true);

			// Cancel after opening
			const touchcancel = create_touch_event('touchcancel', []);
			set_event_target(touchcancel, target);
			window.dispatchEvent(touchcancel);

			// Menu should remain open
			assert.strictEqual(contextmenu.opened, true);
		});
	});

	describe('movement tolerance', () => {
		test('movement at exactly tolerance pixels allows longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_move_tolerance: CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move exactly 21 pixels (at tolerance)
			// Component uses: distance > tolerance
			// So 21 > 21 = false, longpress is NOT cancelled (continues)
			const touchmove = create_touch_event('touchmove', [{ clientX: 121, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open because movement at exactly tolerance is allowed
			// Component logic: 21 > 21 = false, so longpress continues
			assert.strictEqual(contextmenu.opened, true);
		});

		test('movement just under tolerance allows longpress', async () => {
			const { container, contextmenu } = (mounted = mount_contextmenu_root(
				ContextmenuRootForSafariCompatibility
			));

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move just under default tolerance
			const move_distance = CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE - 1;
			const touchmove = create_touch_event('touchmove', [
				{ clientX: 100 + move_distance, clientY: 200, target }
			]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('movement just over tolerance cancels longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_move_tolerance: CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move 22 pixels (just over 21)
			const touchmove = create_touch_event('touchmove', [{ clientX: 122, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('diagonal movement calculates distance correctly (Math.hypot)', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				longpress_move_tolerance: 10
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move diagonally: 6 pixels in X, 8 pixels in Y
			// Distance = sqrt(36 + 64) = sqrt(100) = 10 (exactly at tolerance)
			// Component uses: distance > tolerance
			// So 10 > 10 = false, longpress is NOT cancelled
			const touchmove = create_touch_event('touchmove', [{ clientX: 106, clientY: 208, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open because movement at exactly tolerance is allowed
			assert.strictEqual(contextmenu.opened, true);
		});

		test('menu does NOT close on movement after opening (recent fix)', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu via longpress
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			assert.strictEqual(contextmenu.opened, true);

			// Now move significantly while menu is open
			const touchmove = create_touch_event('touchmove', [{ clientX: 200, clientY: 300, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// Menu should remain open (component checks if menu is open and exits early)
			assert.strictEqual(contextmenu.opened, true);
		});
	});

	describe('synthesized click blocking', () => {
		test('blocks iOS synthesized click immediately after longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			let clicked = false;
			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => (clicked = true) } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Wait for longpress to open menu
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			flushSync();

			assert.strictEqual(contextmenu.opened, true);

			// Touchend (this sets block_next_click flag)
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);
			flushSync(); // Force Svelte to update the conditional onclickcapture handler

			// iOS synthesizes a click event on the menu shortly after touchend
			// Find the actual menu element in DOM
			const menu_element = container.querySelector('.contextmenu');
			assert.ok(menu_element, 'Menu element should exist');

			const synth_click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(synth_click, 'target', { value: menu_element, configurable: true });

			menu_element.dispatchEvent(synth_click);

			// Click should be blocked (captured and prevented)
			assert.strictEqual(synth_click.defaultPrevented, true);
			// Menu item should not have been activated
			assert.strictEqual(clicked, false);
		});

		test('allows subsequent clicks after blocking synthesized click', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu via longpress
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			flushSync();

			// Touchend (sets block_next_click = true)
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);
			flushSync(); // Force Svelte to update the conditional onclickcapture handler

			const menu_element = container.querySelector('.contextmenu');
			assert.ok(menu_element);

			// First click (synthesized by iOS) - should be blocked
			const first_click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(first_click, 'target', { value: menu_element, configurable: true });
			menu_element.dispatchEvent(first_click);

			assert.strictEqual(first_click.defaultPrevented, true, 'First click should be blocked');

			// Second click (user intentionally clicking menu) - should NOT be blocked
			const second_click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(second_click, 'target', { value: menu_element, configurable: true });
			menu_element.dispatchEvent(second_click);

			// Second click should NOT be prevented (block_next_click was cleared after first)
			assert.strictEqual(
				second_click.defaultPrevented,
				false,
				'Second click should not be blocked'
			);
		});

		test('clears block_next_click flag on new touchstart', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// First interaction: open menu via longpress
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Touchend (sets block_next_click = true)
			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);
			flushSync(); // Force Svelte to update

			// Close menu
			contextmenu.close();
			await tick();

			// Second interaction: new touchstart should clear the block_next_click flag
			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 150, clientY: 250, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			flushSync();

			// Now clicks should not be blocked (flag was cleared on touchstart2)
			const menu_element = container.querySelector('.contextmenu');
			assert.ok(menu_element, 'Menu should exist after second longpress');

			const click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(click, 'target', { value: menu_element, configurable: true });
			menu_element.dispatchEvent(click);

			// Click should NOT be prevented (flag cleared by touchstart2)
			assert.strictEqual(
				click.defaultPrevented,
				false,
				'Click should not be blocked after flag cleared'
			);
		});

		test('only blocks click when block_next_click flag is true', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu manually (not via longpress+touchend, so block_next_click not set)
			contextmenu.open(
				[{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }],
				100,
				200
			);
			flushSync();

			const menu_element = container.querySelector('.contextmenu');
			assert.ok(menu_element, 'Menu should exist');

			// Click should work normally (block_next_click is false)
			const click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(click, 'target', { value: menu_element, configurable: true });
			menu_element.dispatchEvent(click);

			// Click should NOT be prevented (flag not set)
			assert.strictEqual(
				click.defaultPrevented,
				false,
				'Click should not be blocked when flag not set'
			);
		});

		test('does not set flag when touchend before longpress completes', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Touchend BEFORE longpress completes (only 200ms into 633ms default)
			vi.advanceTimersByTime(200);
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);
			flushSync();

			// Menu should not be open
			assert.strictEqual(contextmenu.opened, false, 'Menu should not be open');

			// Even though we can't test the internal flag directly, we can verify behavior:
			// If we manually open a menu now, clicks should NOT be blocked (flag not set)
			contextmenu.open(
				[{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }],
				100,
				200
			);
			flushSync();

			const menu_element = container.querySelector('.contextmenu');
			assert.ok(menu_element, 'Menu should exist');

			const click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(click, 'target', { value: menu_element, configurable: true });
			menu_element.dispatchEvent(click);

			// Click should NOT be blocked (flag was not set since longpress_opened was false)
			assert.strictEqual(
				click.defaultPrevented,
				false,
				'Click should not be blocked when touchend happened before longpress'
			);
		});
	});

	describe('CSS class management for iOS selection blocking', () => {
		test('adds contextmenu-pending class to body on touchstart', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// touchstart on valid target
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Class should be added immediately
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				true,
				'contextmenu-pending class should be added'
			);
		});

		test('removes class when longpress completes', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch (adds class)
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			assert.strictEqual(document.body.classList.contains('contextmenu-pending'), true);

			// Wait for longpress to complete
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Class should be removed when menu opens
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should be removed when menu opens'
			);
		});

		test('removes class when movement exceeds tolerance (scrolling)', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch (adds class)
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			assert.strictEqual(document.body.classList.contains('contextmenu-pending'), true);

			// Move beyond tolerance (user is scrolling)
			const touchmove = create_touch_event('touchmove', [
				{ clientX: 100 + CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE + 1, clientY: 200, target }
			]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// Class should be removed (longpress canceled due to scrolling)
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should be removed when user scrolls'
			);
		});

		test('removes class on touchend before longpress completes', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch (adds class)
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			assert.strictEqual(document.body.classList.contains('contextmenu-pending'), true);

			// End touch before longpress completes
			vi.advanceTimersByTime(200); // Part way through
			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);

			// Class should be removed
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should be removed on touchend'
			);
		});

		test('removes class on touchcancel', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch (adds class)
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			assert.strictEqual(document.body.classList.contains('contextmenu-pending'), true);

			// Cancel touch
			const touchcancel = create_touch_event('touchcancel', []);
			set_event_target(touchcancel, target);
			window.dispatchEvent(touchcancel);

			// Class should be removed
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should be removed on touchcancel'
			);
		});

		test('does not add class for invalid targets', () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			// Use an input element (editable, invalid for contextmenu)
			const input = document.createElement('input');
			container.appendChild(input);

			const touchstart = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target: input }
			]);
			set_event_target(touchstart, input);
			window.dispatchEvent(touchstart);

			// Class should NOT be added (invalid target)
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should not be added for editable elements'
			);
		});

		test('does not add class for multiple touches', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Two-finger touch (pinch, zoom, etc.)
			const touchstart = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target },
				{ clientX: 150, clientY: 250, target }
			]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Class should NOT be added (multi-touch gesture)
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should not be added for multi-touch gestures'
			);
		});

		test('bypass gesture does not add class or block clicks', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// First tap
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Class should be added for first tap
			assert.strictEqual(document.body.classList.contains('contextmenu-pending'), true);

			// Short tap duration
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Class should be removed after touchend
			assert.strictEqual(document.body.classList.contains('contextmenu-pending'), false);

			// Second tap quickly (within bypass window) - this triggers bypass
			vi.advanceTimersByTime(100); // Total 200ms from first tap

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Class should NOT be added (bypass detected, early return)
			assert.strictEqual(
				document.body.classList.contains('contextmenu-pending'),
				false,
				'class should not be added during bypass gesture'
			);

			// Hold for longpress duration
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Menu should NOT open (bypass mode)
			assert.strictEqual(contextmenu.opened, false, 'menu should not open during bypass');

			// Now if we manually open a menu, clicks should NOT be blocked (bypass doesn't set flag)
			contextmenu.open(
				[{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }],
				100,
				200
			);
			flushSync();

			const menu_element = container.querySelector('.contextmenu');
			assert.ok(menu_element);

			const click = create_mouse_event('click', { bubbles: true, cancelable: true });
			Object.defineProperty(click, 'target', { value: menu_element, configurable: true });
			menu_element.dispatchEvent(click);

			// Click should NOT be blocked (bypass path doesn't set block_next_click)
			assert.strictEqual(
				click.defaultPrevented,
				false,
				'clicks should not be blocked after bypass gesture'
			);
		});
	});

	describe('preventDefault in touchmove', () => {
		test('calls preventDefault when tracking stationary longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move within tolerance (still tracking longpress)
			const touchmove = create_touch_event('touchmove', [{ clientX: 105, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// preventDefault should have been called
			assert.strictEqual(touchmove.defaultPrevented, true, 'preventDefault should be called');
		});

		test('does not call preventDefault when scrolling (beyond tolerance)', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start touch
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Move beyond tolerance (scrolling)
			const touchmove = create_touch_event('touchmove', [
				{ clientX: 100 + CONTEXTMENU_DEFAULT_LONGPRESS_MOVE_TOLERANCE + 5, clientY: 200, target }
			]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// preventDefault should NOT be called (allow scrolling)
			assert.strictEqual(
				touchmove.defaultPrevented,
				false,
				'preventDefault should not be called when scrolling'
			);
		});

		test('does not call preventDefault when menu already open', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu via longpress
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			assert.strictEqual(contextmenu.opened, true);

			// Now move with menu open
			const touchmove = create_touch_event('touchmove', [{ clientX: 105, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// preventDefault should NOT be called (menu already open, handler exits early)
			assert.strictEqual(
				touchmove.defaultPrevented,
				false,
				'preventDefault should not be called when menu already open'
			);
		});

		test('does not call preventDefault when not tracking longpress', () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			// touchmove without any touchstart first (no tracking)
			const touchmove = create_touch_event('touchmove', [{ clientX: 105, clientY: 200, target }]);
			set_event_target(touchmove, target);
			window.dispatchEvent(touchmove);

			// preventDefault should NOT be called (no longpress being tracked)
			assert.strictEqual(
				touchmove.defaultPrevented,
				false,
				'preventDefault should not be called when not tracking'
			);
		});
	});
});

describe('ContextmenuRootForSafariCompatibility - Synthesized Click After Native Contextmenu Open', () => {
	let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		if (mounted) {
			await unmount_component(mounted.instance, mounted.container);
			mounted = null;
		}
		vi.useRealTimers();
	});

	// When the device fires the native `contextmenu` event before the custom longpress
	// completes ("faster than our longpress"), the release of that gesture must be guarded
	// just like the custom-longpress path (see `ContextmenuOpenGuard`).
	test('release after a native-contextmenu open does not activate the first item', async () => {
		mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);
		const { container, contextmenu } = mounted;

		let activated = false;
		const target = document.createElement('div');
		container.appendChild(target);
		const cleanup = await setup_contextmenu_attachment(target, [
			{
				snippet: 'text',
				props: {
					content: 'First',
					icon: '🧪',
					run: () => {
						activated = true;
					}
				}
			}
		]);

		// Finger down starts the custom longpress timer.
		const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
		set_event_target(touchstart, target);
		window.dispatchEvent(touchstart);

		// The device fires the native `contextmenu` before the custom longpress completes.
		vi.advanceTimersByTime(100);
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
