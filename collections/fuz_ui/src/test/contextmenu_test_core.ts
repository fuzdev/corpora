/**
 * Shared core functionality tests for contextmenu components.
 * Tests opening, closing, event handling, and basic interactions.
 */

import { describe, test, assert, afterEach } from 'vitest';
import { flushSync } from 'svelte';

import { contextmenu_attachment } from '$lib/contextmenu_state.svelte.ts';
import {
	unmount_component,
	create_contextmenu_event,
	create_mouse_event,
	create_keyboard_event,
	set_event_target
} from './test_helpers.ts';
import {
	mount_contextmenu_root,
	setup_contextmenu_attachment,
	type SharedTestOptions
} from './contextmenu_test_helpers.ts';

export const create_shared_core_tests = (
	Component: any,
	component_name: string,
	options: SharedTestOptions = {}
): void => {
	const { requires_longpress = false } = options;

	describe(`${component_name} - Core Functionality`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
		});

		describe('contextmenu event handling', () => {
			test(
				requires_longpress
					? 'opens on contextmenu event'
					: 'rightclick opens contextmenu with entries',
				async () => {
					mounted = mount_contextmenu_root(Component);

					const { container, contextmenu } = mounted;

					const target = document.createElement('div');
					container.appendChild(target);

					await setup_contextmenu_attachment(target, [
						{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
					]);

					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);

					target.dispatchEvent(event);

					assert.strictEqual(contextmenu.opened, true);
					assert.strictEqual(contextmenu.x, 98); // 100 + offset_x (-2)
					assert.strictEqual(contextmenu.y, 198); // 200 + offset_y (-2)
					assert.strictEqual(event.defaultPrevented, true);
				}
			);

			test(
				requires_longpress
					? 'ignores contextmenu with shift key'
					: 'shift+rightclick prevents opening',
				() => {
					mounted = mount_contextmenu_root(Component);

					const { contextmenu } = mounted;

					const event = create_contextmenu_event(100, 200, { shiftKey: true });

					window.dispatchEvent(event);

					assert.strictEqual(contextmenu.opened, false);
					assert.strictEqual(event.defaultPrevented, false);
				}
			);

			test(
				requires_longpress
					? 'ignores contextmenu on editable elements'
					: 'rightclick on input prevents opening',
				() => {
					mounted = mount_contextmenu_root(Component);

					const { container, contextmenu } = mounted;

					const input = document.createElement('input');
					container.appendChild(input);

					const event = create_contextmenu_event(100, 200);
					set_event_target(event, input);

					window.dispatchEvent(event);

					assert.strictEqual(contextmenu.opened, false);
				}
			);

			test('rightclick on textarea prevents opening', () => {
				mounted = mount_contextmenu_root(Component);

				const { container, contextmenu } = mounted;

				const textarea = document.createElement('textarea');
				container.appendChild(textarea);

				const event = create_contextmenu_event(100, 200);
				set_event_target(event, textarea);

				window.dispatchEvent(event);

				assert.strictEqual(contextmenu.opened, false);
			});

			test(
				requires_longpress
					? 'ignores contextmenu inside editable elements (contenteditable parent)'
					: 'rightclick on contenteditable prevents opening',
				() => {
					mounted = mount_contextmenu_root(Component);

					const { container, contextmenu } = mounted;

					const div = document.createElement('div');
					div.contentEditable = 'true';
					container.appendChild(div);

					const event = create_contextmenu_event(100, 200);
					set_event_target(event, div);

					window.dispatchEvent(event);

					assert.strictEqual(contextmenu.opened, false);
				}
			);

			test(
				requires_longpress
					? 'ignores contextmenu on the menu itself'
					: 'rightclick on contextmenu element itself prevents opening',
				async () => {
					mounted = mount_contextmenu_root(Component);

					const { container, contextmenu } = mounted;

					// Open menu first
					contextmenu.open([(() => undefined) as any], 100, 200);
					flushSync();

					const menu_el = container.querySelector('.contextmenu');
					assert.ok(menu_el);

					// Setup a target with contextmenu data
					const target = document.createElement('div');
					menu_el.appendChild(target);

					contextmenu_attachment([
						{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
					])(target);

					// Try to open another contextmenu from within the existing menu
					const event = create_contextmenu_event(150, 250);
					set_event_target(event, target);

					target.dispatchEvent(event);

					// Should still be at original position, not re-opened
					assert.strictEqual(contextmenu.x, 100);
					assert.strictEqual(contextmenu.y, 200);
					assert.strictEqual(event.defaultPrevented, false);
				}
			);

			test(
				requires_longpress ? 'applies offset to contextmenu position' : 'applies custom offsets',
				async () => {
					mounted = mount_contextmenu_root(Component, undefined, {
						open_offset_x: 10,
						open_offset_y: 20
					});

					const { container, contextmenu } = mounted;

					const target = document.createElement('div');
					container.appendChild(target);

					await setup_contextmenu_attachment(target, [
						{ snippet: 'text', props: { content: 'Test', icon: '🧪', run: () => undefined } }
					]);

					const event = create_contextmenu_event(100, 200);
					set_event_target(event, target);

					target.dispatchEvent(event);

					assert.strictEqual(contextmenu.x, 110); // 100 + 10
					assert.strictEqual(contextmenu.y, 220); // 200 + 20
					assert.strictEqual(event.defaultPrevented, true);
				}
			);
		});

		describe('closing behavior', () => {
			test(
				requires_longpress
					? 'closes on mousedown outside menu'
					: 'mousedown outside closes contextmenu',
				() => {
					mounted = mount_contextmenu_root(Component);

					const { contextmenu } = mounted;

					// Open the menu first
					contextmenu.open([], 100, 200);
					flushSync(); // Wait for DOM to update
					assert.strictEqual(contextmenu.opened, true);

					// Click outside
					const event = create_mouse_event('mousedown');
					set_event_target(event, document.body);
					window.dispatchEvent(event);

					assert.strictEqual(contextmenu.opened, false);
				}
			);

			test(
				requires_longpress
					? 'does not close on mousedown inside menu'
					: 'mousedown inside keeps contextmenu open',
				() => {
					mounted = mount_contextmenu_root(Component);

					const { container, contextmenu } = mounted;

					contextmenu.open([(() => undefined) as any], 100, 200);
					flushSync(); // Wait for DOM to update

					// Find the contextmenu element
					const menu_el = container.querySelector('.contextmenu');
					assert.ok(menu_el);

					const event = create_mouse_event('mousedown');
					set_event_target(event, menu_el);
					window.dispatchEvent(event);

					assert.strictEqual(contextmenu.opened, true);
				}
			);

			test(requires_longpress ? 'closes on Escape key' : 'Escape key closes contextmenu', () => {
				mounted = mount_contextmenu_root(Component);

				const { contextmenu } = mounted;

				contextmenu.open([], 100, 200);

				const event = create_keyboard_event('Escape');
				window.dispatchEvent(event);

				assert.strictEqual(contextmenu.opened, false);
			});
		});
	});
};
