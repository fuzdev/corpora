/**
 * Shared keyboard navigation tests for contextmenu components.
 * Tests keyboard shortcuts and event handling.
 */

import { describe, test, assert, afterEach, vi } from 'vitest';
import { unmount_component, create_keyboard_event, set_event_target } from './test_helpers.ts';
import { mount_contextmenu_root, type SharedTestOptions } from './contextmenu_test_helpers.ts';

export const create_shared_keyboard_tests = (
	Component: any,
	component_name: string,
	_options: SharedTestOptions = {}
): void => {
	describe(`${component_name} - Keyboard Navigation`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
		});

		// Test data for keyboard navigation
		const keyboard_test_cases = [
			{ key: 'ArrowDown', method: 'select_next' },
			{ key: 'ArrowUp', method: 'select_previous' },
			{ key: 'ArrowRight', method: 'expand_selected' },
			{ key: 'ArrowLeft', method: 'collapse_selected' },
			{ key: 'Home', method: 'select_first' },
			{ key: 'End', method: 'select_last' },
			{ key: 'Enter', method: 'activate_selected' },
			{ key: ' ', method: 'activate_selected' }
		];

		test('keyboard events only fire when contextmenu is opened', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			// Create a spy on contextmenu methods
			const select_next_spy = vi.spyOn(contextmenu, 'select_next');

			// Try keyboard when closed
			const event = create_keyboard_event('ArrowDown');
			window.dispatchEvent(event);

			assert.strictEqual(select_next_spy.mock.calls.length, 0);

			// Open and try again
			contextmenu.open([], 100, 200);
			window.dispatchEvent(create_keyboard_event('ArrowDown'));

			assert.strictEqual(select_next_spy.mock.calls.length, 1);
		});

		// Data-driven tests for keyboard shortcuts
		test.each(keyboard_test_cases)('$key calls $method', ({ key, method }) => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			contextmenu.open([], 100, 200);
			const spy = vi.spyOn(contextmenu, method as any);

			window.dispatchEvent(create_keyboard_event(key));
			assert.strictEqual(spy.mock.calls.length, 1);
		});

		test('Escape key closes contextmenu', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			contextmenu.open([], 100, 200);

			const event = create_keyboard_event('Escape');
			window.dispatchEvent(event);

			assert.strictEqual(contextmenu.opened, false);
		});

		test('keyboard events on editable elements are ignored', () => {
			mounted = mount_contextmenu_root(Component);

			const { container, contextmenu } = mounted;

			contextmenu.open([], 100, 200);
			const spy = vi.spyOn(contextmenu, 'close');

			const input = document.createElement('input');
			container.appendChild(input);

			const event = create_keyboard_event('Escape');
			set_event_target(event, input);

			window.dispatchEvent(event);

			assert.strictEqual(spy.mock.calls.length, 0);
			assert.strictEqual(contextmenu.opened, true);
		});

		test('keyboard events are prevented', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			contextmenu.open([], 100, 200);

			const event = create_keyboard_event('ArrowDown');
			window.dispatchEvent(event);

			assert.strictEqual(event.defaultPrevented, true);
		});
	});
};
