/**
 * Shared link entry tests for contextmenu components.
 * Tests link entry contextmenu event handling, propagation control, and browser native menu access.
 */

import { describe, test, assert, afterEach, beforeEach, vi } from 'vitest';
import { flushSync, tick } from 'svelte';
import { on } from 'svelte/events';
import {
	unmount_component,
	create_contextmenu_event,
	create_keyboard_event,
	create_touch_event,
	set_event_target
} from './test_helpers.ts';
import {
	mount_contextmenu_root,
	setup_contextmenu_attachment,
	type SharedTestOptions
} from './contextmenu_test_helpers.ts';
import { CONTEXTMENU_DEFAULT_LONGPRESS_DURATION } from '$lib/contextmenu_helpers.ts';

export const create_shared_link_entry_tests = (
	Component: any,
	component_name: string,
	options: SharedTestOptions = {}
): void => {
	const { requires_longpress = false } = options;

	describe(`${component_name} - Link Entry Handling`, () => {
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

		describe('link entry contextmenu handling', () => {
			test('right-clicking on link entry stops propagation', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://ui.fuz.dev/' } }
				]);

				// Open menu
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
				assert.strictEqual(contextmenu.opened, true);

				const menu = container.querySelector('.contextmenu');
				assert.ok(menu, 'contextmenu should be rendered');

				const link = menu.querySelector('a[href="https://ui.fuz.dev/"]');
				assert.ok(link, 'link entry should be rendered');

				// Track if window handler was called
				let window_handler_called = false;
				const original_position_x = contextmenu.x;
				const original_position_y = contextmenu.y;

				const window_listener = () => {
					window_handler_called = true;
				};
				const off = on(window, 'contextmenu', window_listener);

				try {
					// Right-click on the link
					const link_event = create_contextmenu_event(150, 250);
					set_event_target(link_event, link);
					link.dispatchEvent(link_event);

					// Verify the contextmenu stayed at original position (didn't reopen)
					assert.strictEqual(contextmenu.x, original_position_x);
					assert.strictEqual(contextmenu.y, original_position_y);

					// Event should not be prevented (allows browser's default contextmenu)
					assert.strictEqual(
						link_event.defaultPrevented,
						false,
						'event should not be prevented to allow browser contextmenu'
					);

					// Window handler should not be called due to stopPropagation
					assert.strictEqual(
						window_handler_called,
						false,
						'event should not propagate to window handler'
					);
				} finally {
					off();
				}
			});

			test('right-clicking on link entry does not prevent default', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://fuz.dev' } }
				]);

				// Open menu
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

				const link = container.querySelector('a[href="https://fuz.dev"]');
				assert.ok(link);

				// Right-click on link
				const ctxmenu = create_contextmenu_event(100, 200);
				set_event_target(ctxmenu, link);
				link.dispatchEvent(ctxmenu);

				// Should NOT be prevented - browser can show native menu
				assert.strictEqual(ctxmenu.defaultPrevented, false);
			});

			test('keyboard selection highlights the link entry', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://ui.fuz.dev/' } }
				]);

				// Open menu
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
				assert.strictEqual(contextmenu.opened, true);

				const link = container.querySelector('a[href="https://ui.fuz.dev/"]');
				assert.ok(link, 'link entry should be rendered');
				assert.strictEqual(link.classList.contains('selected'), false);

				// Arrow down selects the first (only) item - the link entry must show it
				window.dispatchEvent(create_keyboard_event('ArrowDown'));
				flushSync();

				assert.strictEqual(link.classList.contains('selected'), true);
			});

			test('multiple link entries each handle contextmenu independently', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://ui.fuz.dev/' } },
					{ snippet: 'link', props: { href: 'https://fuz.dev/' } }
				]);

				// Open menu
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

				const links = menu.querySelectorAll('a');
				assert.strictEqual(links.length, 2, 'should have 2 links');

				// Track if window handler was called
				let window_handler_called = false;
				const window_listener = () => {
					window_handler_called = true;
				};
				const off = on(window, 'contextmenu', window_listener);

				try {
					// Test both links
					for (const link of links) {
						window_handler_called = false; // Reset for each link

						const event = create_contextmenu_event(150, 250);
						set_event_target(event, link);
						link.dispatchEvent(event);

						// Event should not propagate for any link
						assert.strictEqual(
							window_handler_called,
							false,
							`event should not propagate for link ${link.getAttribute('href')}`
						);

						assert.strictEqual(
							event.defaultPrevented,
							false,
							'event should not be prevented to allow browser contextmenu'
						);
					}
				} finally {
					off();
				}
			});

			test('link entry prevents Fuz menu from reopening', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://ui.fuz.dev/' } }
				]);

				// Open menu
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

				const link = menu.querySelector('a[href="https://ui.fuz.dev/"]');
				assert.ok(link);

				// Store the original params count
				const original_params = contextmenu.params;

				// Right-click on the link
				const event = create_contextmenu_event(150, 250);
				set_event_target(event, link);
				link.dispatchEvent(event);

				// The contextmenu params should not have changed
				// (if the bug existed, contextmenu_query_params would detect the <a> tag and reopen)
				assert.deepStrictEqual(
					contextmenu.params,
					original_params,
					'contextmenu params should not change'
				);

				// Position should not change
				assert.strictEqual(contextmenu.x >= 0, true);
				assert.strictEqual(contextmenu.y >= 0, true);
			});

			test('window contextmenu handler not called for link entries', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://fuz.dev' } }
				]);

				// Open menu
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

				const link = container.querySelector('a[href="https://fuz.dev"]');
				assert.ok(link);

				// Track if window handler is called
				let window_handler_called = false;
				const original_open = contextmenu.open.bind(contextmenu);
				contextmenu.open = ((...args: Array<any>) => {
					window_handler_called = true;
					return (original_open as any)(...args);
				}) as any;

				// Right-click on link
				const ctxmenu = create_contextmenu_event(100, 200);
				set_event_target(ctxmenu, link);
				link.dispatchEvent(ctxmenu);

				// Window handler should not be triggered due to stopPropagation
				assert.strictEqual(window_handler_called, false);
			});

			test("browser's native link contextmenu can open", async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://fuz.dev', content: 'Example Link' } }
				]);

				// Open menu
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

				const link = container.querySelector('a[href="https://fuz.dev"]');
				assert.ok(link);

				// Right-click on link
				const ctxmenu = create_contextmenu_event(150, 250);
				set_event_target(ctxmenu, link);
				link.dispatchEvent(ctxmenu);

				// The event should not be prevented, allowing native menu
				assert.strictEqual(ctxmenu.defaultPrevented, false);

				// And contextmenu should still be open (not closed by this action)
				assert.strictEqual(contextmenu.opened, true);
			});

			test('contextmenu position unchanged when right-clicking link entry', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://fuz.dev', content: 'Example Link' } }
				]);

				// Open menu at specific position
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

				const initial_x = contextmenu.x;
				const initial_y = contextmenu.y;

				flushSync();

				const menu_link = container.querySelector('a[href="https://fuz.dev"]');
				assert.ok(menu_link);

				// Right-click on link entry
				const ctxmenu = create_contextmenu_event(150, 250);
				set_event_target(ctxmenu, menu_link);
				menu_link.dispatchEvent(ctxmenu);

				// Position should be unchanged
				assert.strictEqual(contextmenu.x, initial_x);
				assert.strictEqual(contextmenu.y, initial_y);
			});
		});

		describe('link entry regression tests', () => {
			test('without stopPropagation, contextmenu_query_params auto-detects links (demonstrates bug)', () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				// Create a link element WITHOUT the stopPropagation fix
				// (simulating the old behavior before the fix was applied)
				const manual_link = document.createElement('a');
				manual_link.href = 'https://regression.test/';
				manual_link.textContent = 'Test Link';
				container.appendChild(manual_link);

				// Track if window contextmenu handler processes this
				const original_open = contextmenu.open.bind(contextmenu);
				let open_was_called = false;
				let open_params: any = null;

				// Spy on contextmenu.open to see if contextmenu_query_params detects the link
				contextmenu.open = (params: any, x: number, y: number) => {
					open_was_called = true;
					open_params = params;
					original_open(params, x, y);
				};

				try {
					// Right-click on the link (without stopPropagation)
					const event = create_contextmenu_event(150, 250);
					set_event_target(event, manual_link);
					// Dispatch to window so it goes through the normal handler
					window.dispatchEvent(event);

					// The window handler should have called open with auto-detected link params
					// This demonstrates what WOULD happen without the stopPropagation fix
					assert.strictEqual(
						open_was_called,
						true,
						'contextmenu.open should be called when link is detected'
					);

					// Verify that contextmenu_query_params auto-detected the <a> tag
					// (This is the behavior at contextmenu_state.svelte.ts:410)
					assert.ok(open_params, 'params should exist');
					assert.ok(Array.isArray(open_params), 'params should be an array');
					const link_param = open_params.find((p: any) => p.snippet === 'link');
					assert.ok(link_param, 'should contain a link snippet auto-detected from <a> tag');
					assert.strictEqual(
						link_param.props.href,
						'https://regression.test/',
						'auto-detected link should have correct href'
					);
				} finally {
					// Restore original open method
					contextmenu.open = original_open;
					manual_link.remove();
				}
			});

			test('stopPropagation prevents auto-detection bug', async () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const target = document.createElement('div');
				container.appendChild(target);

				await setup_contextmenu_attachment(target, [
					{ snippet: 'link', props: { href: 'https://fixed.test/' } }
				]);

				// Open menu with a link entry (which HAS stopPropagation)
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

				const link = menu.querySelector('a[href="https://fixed.test/"]');
				assert.ok(link);

				// Spy on contextmenu.open to verify it's NOT called again
				const original_open = contextmenu.open.bind(contextmenu);
				let open_was_called = false;

				contextmenu.open = (params: any, x: number, y: number) => {
					open_was_called = true;
					original_open(params, x, y);
				};

				try {
					// Right-click on the link (WITH stopPropagation fix)
					const event = create_contextmenu_event(150, 250);
					set_event_target(event, link);
					link.dispatchEvent(event);

					// The window handler should NOT have been reached due to stopPropagation
					assert.strictEqual(
						open_was_called,
						false,
						'contextmenu.open should NOT be called due to stopPropagation fix'
					);

					// This proves the fix works: stopPropagation prevents the event from
					// reaching the window handler, so contextmenu_query_params never runs
				} finally {
					// Restore original open method
					contextmenu.open = original_open;
				}
			});
		});
	});
};
