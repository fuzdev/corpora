/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, tick } from 'svelte';

import ContextmenuRootForSafariCompatibility from '$lib/ContextmenuRootForSafariCompatibility.svelte';
import {
	unmount_component,
	create_touch_event,
	create_contextmenu_event,
	set_event_target
} from './test_helpers.ts';
import {
	mount_contextmenu_root,
	setup_contextmenu_attachment
} from './contextmenu_test_helpers.ts';
import {
	CONTEXTMENU_DEFAULT_LONGPRESS_DURATION,
	CONTEXTMENU_DEFAULT_BYPASS_WINDOW
} from '$lib/contextmenu_helpers.ts';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('ContextmenuRootForSafariCompatibility - Tap-Then-Longpress Bypass Gesture', () => {
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

	describe('basic bypass detection', () => {
		test('bypasses contextmenu on tap-then-longpress', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_window: CONTEXTMENU_DEFAULT_BYPASS_WINDOW
			});

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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window (total 300ms from first tap)
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 102, clientY: 201, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Advance past longpress duration - should NOT open
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, false);

			// Contextmenu event should bypass (not be prevented)
			const ctxmenu = create_contextmenu_event(102, 201);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			assert.strictEqual(ctxmenu.defaultPrevented, false, 'bypass should allow native menu');
		});

		test('does not bypass if second tap is too far', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_move_tolerance: 10
			});

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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap too far away (15 pixels when tolerance is 10)
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 115, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Should start normal longpress
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('does not bypass if second tap is too late', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_window: CONTEXTMENU_DEFAULT_BYPASS_WINDOW
			});

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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap too late (exceeds bypass window)
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_BYPASS_WINDOW + 40);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Should start normal longpress
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('bypass can be disabled with bypass_with_tap_then_longpress=false', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_with_tap_then_longpress: false
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Try bypass gesture
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within normal bypass window
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Should open normally since bypass is disabled
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('respects custom bypass_window', async () => {
			const custom_bypass_window = 1000; // Longer window
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_window: custom_bypass_window
			});

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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within custom bypass window (total 900ms, within 1000ms window)
			vi.advanceTimersByTime(800);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should bypass
			assert.strictEqual(contextmenu.opened, false);
		});

		test('respects custom bypass_move_tolerance', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_move_tolerance: 50 // Very loose tolerance
			});

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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap 40 pixels away (within 50px tolerance)
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 140, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should bypass
			assert.strictEqual(contextmenu.opened, false);
		});
	});

	describe('bypass state management', () => {
		test('tap on editable element resets bypass state', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			const input = document.createElement('input');
			container.appendChild(target);
			container.appendChild(input);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// First tap on valid target
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap on editable element - should reset state
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target: input }
			]);
			set_event_target(touchstart2, input);
			window.dispatchEvent(touchstart2);

			// Tap on input holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend2 = create_touch_event('touchend', []);
			set_event_target(touchend2, input);
			window.dispatchEvent(touchend2);

			// Third tap on valid target - should start fresh, not bypass
			vi.advanceTimersByTime(200);

			const touchstart3 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart3, target);
			window.dispatchEvent(touchstart3);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open normally (not bypass)
			assert.strictEqual(contextmenu.opened, true);
		});

		test('touchcancel after tap resets bypass state', async () => {
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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Cancel before second tap
			vi.advanceTimersByTime(100);

			const touchcancel = create_touch_event('touchcancel', []);
			set_event_target(touchcancel, target);
			window.dispatchEvent(touchcancel);

			// Second tap after cancel
			vi.advanceTimersByTime(100);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open normally (not bypass)
			assert.strictEqual(contextmenu.opened, true);
		});

		test('touchend preserves tap tracking for bypass detection', async () => {
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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(300);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Should have triggered bypass
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('bypass flag cleared after touchend prevents stuck bypass', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Trigger bypass
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Bypass is set - now lift finger without contextmenu event
			vi.advanceTimersByTime(100);

			const touchend2 = create_touch_event('touchend', []);
			set_event_target(touchend2, target);
			window.dispatchEvent(touchend2);

			// Wait for bypass flag to clear
			vi.advanceTimersByTime(1000);
			await tick();

			// Start a new touch - should work normally
			const touchstart3 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart3, target);
			window.dispatchEvent(touchstart3);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
		});

		test('timeout does not interfere with bypass flag', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_window: CONTEXTMENU_DEFAULT_BYPASS_WINDOW
			});

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

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap before timeout expires (total 600ms, within CONTEXTMENU_DEFAULT_BYPASS_WINDOW)
			vi.advanceTimersByTime(500);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Bypass should be set and prevent opening
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('ignores touch events when contextmenu already open', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Open menu
			contextmenu.open(
				[{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }],
				150,
				250
			);
			flushSync();

			// Try bypass gesture
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Menu position should be unchanged
			assert.strictEqual(contextmenu.x, 150);
			assert.strictEqual(contextmenu.y, 250);
		});

		test('ignores touch events with multiple touches', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Multi-touch should not start bypass tracking
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target },
				{ clientX: 150, clientY: 250, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Multi-touch holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Single touch after - should not trigger bypass
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open normally
			assert.strictEqual(contextmenu.opened, true);
		});

		test('ignores touch events on editable elements', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const input = document.createElement('input');
			container.appendChild(input);

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Tap on input
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target: input }
			]);
			set_event_target(touchstart1, input);
			window.dispatchEvent(touchstart1);

			// Tap on input holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, input);
			window.dispatchEvent(touchend1);

			// Tap on valid target
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open normally (not bypass)
			assert.strictEqual(contextmenu.opened, true);
		});

		test('ignores touch events with shift key pressed', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Tap with shift key
			const touchstart1 = create_touch_event(
				'touchstart',
				[{ clientX: 100, clientY: 200, target }],
				{
					shiftKey: true
				}
			);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap with shift holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Normal tap after shift tap
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open normally (not bypass)
			assert.strictEqual(contextmenu.opened, true);
		});
	});

	describe('bypass with native contextmenu', () => {
		test('bypass works with contextmenu event after gesture', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Bypass gesture
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Browser fires contextmenu event
			vi.advanceTimersByTime(500);

			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			// Should not prevent default (bypass)
			assert.strictEqual(ctxmenu.defaultPrevented, false);
			assert.strictEqual(contextmenu.opened, false);
		});

		test('bypass flag is cleared after contextmenu event consumes it', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Trigger bypass
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Contextmenu event consumes bypass
			vi.advanceTimersByTime(500);

			const ctxmenu1 = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu1, target);
			target.dispatchEvent(ctxmenu1);

			assert.strictEqual(ctxmenu1.defaultPrevented, false);

			// Second contextmenu should work normally
			vi.advanceTimersByTime(1000);

			const ctxmenu2 = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu2, target);
			target.dispatchEvent(ctxmenu2);

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(ctxmenu2.defaultPrevented, true);
		});

		test('second contextmenu event works normally after bypass consumed', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Bypass gesture and consume
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);
			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);
			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Browser fires contextmenu event
			vi.advanceTimersByTime(500);
			const ctxmenu1 = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu1, target);
			target.dispatchEvent(ctxmenu1);

			assert.strictEqual(ctxmenu1.defaultPrevented, false);

			// Try normal contextmenu now
			vi.advanceTimersByTime(1000);
			const ctxmenu2 = create_contextmenu_event(150, 250);
			set_event_target(ctxmenu2, target);
			target.dispatchEvent(ctxmenu2);

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.x, 148);
			assert.strictEqual(contextmenu.y, 248);
			assert.strictEqual(ctxmenu2.defaultPrevented, true);
		});
	});

	describe('rapid gesture sequences', () => {
		test('handles rapid tap sequences (3+ taps)', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Three rapid taps
			for (let i = 0; i < 3; i++) {
				const touchstart = create_touch_event('touchstart', [
					{ clientX: 100, clientY: 200, target }
				]);
				set_event_target(touchstart, target);
				window.dispatchEvent(touchstart);

				// Tap holds for 50ms
				vi.advanceTimersByTime(50);

				const touchend = create_touch_event('touchend', []);
				set_event_target(touchend, target);
				window.dispatchEvent(touchend);

				// Wait 100ms before next tap
				vi.advanceTimersByTime(100);
			}

			// Should not crash or cause issues
			vi.advanceTimersByTime(1000);
			await tick();

			// Component should be stable
			assert.strictEqual(contextmenu.opened, false);
		});

		test('handles alternating tap and touchcancel', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Tap, cancel, tap, cancel pattern
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Touch holds for 100ms
			vi.advanceTimersByTime(100);

			const touchcancel1 = create_touch_event('touchcancel', []);
			set_event_target(touchcancel1, target);
			window.dispatchEvent(touchcancel1);

			// Wait after cancel
			vi.advanceTimersByTime(100);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Touch holds for 100ms
			vi.advanceTimersByTime(100);

			const touchcancel2 = create_touch_event('touchcancel', []);
			set_event_target(touchcancel2, target);
			window.dispatchEvent(touchcancel2);

			// Should be stable
			vi.advanceTimersByTime(1000);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('handles mixed touch and mouse input', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Touch tap
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Touch holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend = create_touch_event('touchend', []);
			set_event_target(touchend, target);
			window.dispatchEvent(touchend);

			// Then mouse contextmenu
			vi.advanceTimersByTime(200);

			const ctxmenu = create_contextmenu_event(100, 200);
			set_event_target(ctxmenu, target);
			target.dispatchEvent(ctxmenu);

			// Should open normally via contextmenu event
			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(ctxmenu.defaultPrevented, true);
		});
	});

	describe('bypass interaction with longpress', () => {
		test('bypass prevents longpress from starting', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Trigger bypass
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Bypass is set - longpress should not start
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, false);
		});

		test('longpress state cleared when bypass detected', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Start first touch
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);

			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second touch triggers bypass - should not start longpress
			vi.advanceTimersByTime(200);

			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Wait beyond longpress duration
			vi.advanceTimersByTime(1000);
			await tick();

			// Menu should not open
			assert.strictEqual(contextmenu.opened, false);
		});

		test('bypass does not affect subsequent normal longpress after expiry', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility, undefined, {
				bypass_window: CONTEXTMENU_DEFAULT_BYPASS_WINDOW
			});

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
			]);

			// Trigger and consume bypass
			const touchstart1 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart1, target);
			window.dispatchEvent(touchstart1);

			// Tap holds for 100ms
			vi.advanceTimersByTime(100);
			const touchend1 = create_touch_event('touchend', []);
			set_event_target(touchend1, target);
			window.dispatchEvent(touchend1);

			// Second tap within bypass window
			vi.advanceTimersByTime(200);
			const touchstart2 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart2, target);
			window.dispatchEvent(touchstart2);

			// Second tap holds for 100ms
			vi.advanceTimersByTime(100);
			const touchend2 = create_touch_event('touchend', []);
			set_event_target(touchend2, target);
			window.dispatchEvent(touchend2);

			// Wait for bypass window to expire
			vi.advanceTimersByTime(1000);

			// Now try normal longpress
			const touchstart3 = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target }
			]);
			set_event_target(touchstart3, target);
			window.dispatchEvent(touchstart3);

			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open normally
			assert.strictEqual(contextmenu.opened, true);
		});
	});
});
