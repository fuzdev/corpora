/**
 * Shared nested element tests for contextmenu components.
 * Tests handling of nested elements, submenu structures, and event propagation boundaries.
 */

import { describe, test, assert, afterEach, beforeEach, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { on } from 'svelte/events';
import {
	unmount_component,
	create_contextmenu_event,
	create_touch_event,
	set_event_target
} from './test_helpers.ts';
import {
	mount_contextmenu_root,
	setup_contextmenu_attachment,
	type SharedTestOptions
} from './contextmenu_test_helpers.ts';
import { CONTEXTMENU_DEFAULT_LONGPRESS_DURATION } from '$lib/contextmenu_helpers.ts';

export const create_shared_nested_tests = (
	Component: any,
	component_name: string,
	options: SharedTestOptions = {}
): void => {
	const { requires_longpress = false } = options;

	describe(`${component_name} - Nested Element Handling`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		if (requires_longpress) {
			beforeEach(() => {
				vi.useFakeTimers();
			});
		}

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
			if (requires_longpress) {
				vi.useRealTimers();
			}
		});

		describe('nested element contextmenu handling', () => {
			test('right-clicking on nested element inside contextmenu does not reopen', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
				]);

				// Open contextmenu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open contextmenu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu, 'contextmenu should be rendered');

				// Create a nested element inside the menu (simulating submenu structure)
				const nested_div = document.createElement('div');
				nested_div.className = 'test_nested';
				nested_div.textContent = 'Nested content';
				menu.appendChild(nested_div);

				const original_x = contextmenu.x;
				const original_y = contextmenu.y;

				// Right-click on the nested element
				const event = create_contextmenu_event(150, 250);
				set_event_target(event, nested_div);
				nested_div.dispatchEvent(event);

				// Contextmenu should not reopen (position unchanged)
				assert.strictEqual(contextmenu.x, original_x);
				assert.strictEqual(contextmenu.y, original_y);

				// Event should not be prevented (allows browser contextmenu)
				assert.strictEqual(
					event.defaultPrevented,
					false,
					'event should not be prevented to allow browser contextmenu'
				);
			});

			test('right-clicking on deeply nested element does not reopen contextmenu', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
				]);

				// Open contextmenu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open contextmenu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu);

				// Create deeply nested structure (like a submenu with content)
				const level1 = document.createElement('div');
				const level2 = document.createElement('menu');
				const level3 = document.createElement('div');
				level3.className = 'deeply_nested';
				level3.textContent = 'Deeply nested';

				menu.appendChild(level1);
				level1.appendChild(level2);
				level2.appendChild(level3);

				const original_x = contextmenu.x;
				const original_y = contextmenu.y;

				// Right-click on the deeply nested element
				const event = create_contextmenu_event(200, 300);
				set_event_target(event, level3);
				level3.dispatchEvent(event);

				// Contextmenu should not reopen
				assert.strictEqual(contextmenu.x, original_x);
				assert.strictEqual(contextmenu.y, original_y);

				assert.strictEqual(
					event.defaultPrevented,
					false,
					'event should not be prevented to allow browser contextmenu'
				);
			});

			test('containment check works for dynamically added elements', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
				]);

				// Open contextmenu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open contextmenu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu);

				// Dynamically add element after menu is open (simulating submenu expansion)
				const dynamic_element = document.createElement('div');
				dynamic_element.className = 'dynamic_submenu';
				menu.appendChild(dynamic_element);

				const original_params = contextmenu.params;

				// Right-click on dynamically added element
				const event = create_contextmenu_event(180, 280);
				set_event_target(event, dynamic_element);
				dynamic_element.dispatchEvent(event);

				// Contextmenu params should not change
				assert.deepStrictEqual(contextmenu.params, original_params);

				assert.strictEqual(
					event.defaultPrevented,
					false,
					'event should not be prevented to allow browser contextmenu'
				);
			});

			test('parent menu stays at original position when nested element is right-clicked', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
				]);

				// Open contextmenu at specific position
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open contextmenu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu);

				const initial_x = contextmenu.x;
				const initial_y = contextmenu.y;
				const initial_opened = contextmenu.opened;

				// Add nested element
				const nested = document.createElement('div');
				menu.appendChild(nested);

				// Right-click on nested element
				const event = create_contextmenu_event(250, 350);
				set_event_target(event, nested);
				nested.dispatchEvent(event);

				// Parent menu should maintain state
				assert.strictEqual(contextmenu.x, initial_x, 'x position should not change');
				assert.strictEqual(contextmenu.y, initial_y, 'y position should not change');
				assert.strictEqual(contextmenu.opened, initial_opened, 'opened state should not change');
			});

			test('event propagation stops at contextmenu boundary', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
				]);

				// Open contextmenu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open contextmenu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu);

				// Add nested content
				const nested = document.createElement('div');
				menu.appendChild(nested);

				// Right-click on nested element
				const event = create_contextmenu_event(150, 250);
				set_event_target(event, nested);
				// Dispatch through window to test propagation
				window.dispatchEvent(event);

				// The contextmenu component should handle the containment check
				// and not reopen for clicks within its own boundaries
				const final_params = contextmenu.params;
				assert.ok(final_params, 'params should still exist');
			});
		});

		describe('link entries in nested structure', () => {
			test('link in nested structure uses stopPropagation', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://nested.test/' } }
				]);

				// Open menu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open menu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu);

				const link = menu.querySelector('a[href="https://nested.test/"]');
				assert.ok(link, 'link should be rendered');

				// Track if window handler was called
				let window_handler_called = false;
				const window_listener = () => {
					window_handler_called = true;
				};
				const off = on(window, 'contextmenu', window_listener);

				try {
					const event = create_contextmenu_event(150, 250);
					set_event_target(event, link);
					link.dispatchEvent(event);

					// Window handler should not be called due to stopPropagation
					assert.strictEqual(
						window_handler_called,
						false,
						'event should not propagate to window handler'
					);

					assert.strictEqual(
						event.defaultPrevented,
						false,
						'event should not be prevented to allow browser contextmenu'
					);
				} finally {
					off();
				}
			});

			test('link in submenu allows browser contextmenu', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				// Setup contextmenu with nested structure (simplified)
				await setup_contextmenu_attachment(target, [
					{ snippet: 'text', props: { content: 'Parent', icon: '📁', run: () => undefined } },
					{ snippet: 'link', props: { href: 'https://fuz.dev', content: 'Nested Link' } }
				]);

				// Open menu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open menu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const link = container.querySelector('a[href="https://fuz.dev"]');
				assert.ok(link);

				// Right-click on link
				const ctxmenu = create_contextmenu_event(150, 250);
				set_event_target(ctxmenu, link);
				link.dispatchEvent(ctxmenu);

				// Should allow native menu (not prevented)
				assert.strictEqual(ctxmenu.defaultPrevented, false);
			});

			test('deeply nested link entry behavior consistent', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://deep.test/', content: 'Deep Link' } }
				]);

				// Open menu
				if (requires_longpress) {
					const touchstart = create_touch_event('touchstart', [
						{ clientX: 100, clientY: 200, target }
					]);
					set_event_target(touchstart, target);
					window.dispatchEvent(touchstart);

					// Trigger longpress to open menu
					vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
					await tick();
				} else {
					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);
					target.dispatchEvent(event);
				}

				flushSync();

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu);

				const link = menu.querySelector('a[href="https://deep.test/"]');
				assert.ok(link);

				// Store initial state
				const initial_x = contextmenu.x;
				const initial_y = contextmenu.y;
				const initial_opened = contextmenu.opened;

				// Right-click on deeply nested link
				const ctxmenu = create_contextmenu_event(170, 270);
				set_event_target(ctxmenu, link);
				link.dispatchEvent(ctxmenu);

				// Behavior should be consistent: no reopen, no prevention
				assert.strictEqual(contextmenu.x, initial_x);
				assert.strictEqual(contextmenu.y, initial_y);
				assert.strictEqual(contextmenu.opened, initial_opened);
				assert.strictEqual(ctxmenu.defaultPrevented, false);
			});
		});
	});
};
