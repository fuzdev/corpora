/**
 * Shared scoped mode tests for contextmenu components.
 * Tests scoped=true/false behavior and wrapper div.
 */

import { describe, test, assert, afterEach } from 'vitest';
import { unmount_component, create_contextmenu_event } from './test_helpers.ts';
import { mount_contextmenu_root, type SharedTestOptions } from './contextmenu_test_helpers.ts';

export const create_shared_scoped_tests = (
	Component: any,
	component_name: string,
	_options: SharedTestOptions = {}
): void => {
	describe(`${component_name} - Scoped Mode`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
		});

		test('scoped=true wraps children in div', () => {
			mounted = mount_contextmenu_root(Component, undefined, { scoped: true });

			const { container } = mounted;

			const scoped_div = container.querySelector('.contextmenu-root');
			assert.ok(scoped_div);
			// `group` rather than a landmark role - no accessible name required
			assert.strictEqual(scoped_div.getAttribute('role'), 'group');
		});

		test('scoped=false does not wrap children', () => {
			mounted = mount_contextmenu_root(Component, undefined, { scoped: false });

			const { container } = mounted;

			const scoped_div = container.querySelector('.contextmenu-root');
			assert.strictEqual(scoped_div, null);
		});

		test('scoped=true disables window contextmenu handler', () => {
			mounted = mount_contextmenu_root(Component, undefined, { scoped: true });

			const { contextmenu } = mounted;

			// Try to trigger contextmenu on window
			const event = create_contextmenu_event(100, 200);
			window.dispatchEvent(event);

			// Should not have opened because scoped mode disables window handler
			assert.strictEqual(contextmenu.opened, false);
		});
	});
};
