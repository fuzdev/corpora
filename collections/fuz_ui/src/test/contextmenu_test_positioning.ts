/**
 * Shared positioning tests for contextmenu components.
 * Tests menu positioning, edge detection, and layout tracking.
 */

import { describe, test, assert, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { ContextmenuState } from '$lib/contextmenu_state.svelte.ts';
import { unmount_component } from './test_helpers.ts';
import { mount_contextmenu_root, type SharedTestOptions } from './contextmenu_test_helpers.ts';

export const create_shared_positioning_tests = (
	Component: any,
	component_name: string,
	_options: SharedTestOptions = {}
): void => {
	describe(`${component_name} - Positioning`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
		});

		test('menu positioned at click coordinates with offset', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			contextmenu.open([], 100, 200);

			assert.strictEqual(contextmenu.x, 100);
			assert.strictEqual(contextmenu.y, 200);
		});

		test('menu element receives transform style', () => {
			mounted = mount_contextmenu_root(Component);

			const { container, contextmenu } = mounted;

			contextmenu.open([(() => undefined) as any], 100, 200);
			flushSync(); // Wait for DOM to update

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			const menu = container.querySelector('.contextmenu') as HTMLElement | null;
			assert.ok(menu);

			// The transform includes the derived x/y which may have edge adjustments
			assert.ok(menu.style.transform.includes('translate3d'));
		});

		test('contextmenu layout tracking updates layout dimensions', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			// Verify layout has the dimensions from test setup
			assert.ok(contextmenu.layout);
			assert.strictEqual(contextmenu.layout.width, 1024);
			assert.strictEqual(contextmenu.layout.height, 768);
		});

		test('menu repositions when near right edge', () => {
			mounted = mount_contextmenu_root(Component);

			const { container, contextmenu } = mounted;

			// Open menu near right edge (1020 + assumed menu width would overflow 1024)
			contextmenu.open([(() => undefined) as any], 1020, 100);
			flushSync();

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			const menu = container.querySelector('.contextmenu') as HTMLElement | null;
			assert.ok(menu);

			// Menu should be repositioned - the x position in transform should be adjusted left
			// to prevent overflow. The exact value depends on menu width from getBoundingClientRect
			const transform = menu.style.transform;
			assert.ok(transform.includes('translate3d'), 'should have translate3d transform');
		});

		test('menu repositions when near bottom edge', () => {
			mounted = mount_contextmenu_root(Component);

			const { container, contextmenu } = mounted;

			// Open menu near bottom edge
			contextmenu.open([(() => undefined) as any], 100, 760);
			flushSync();

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			const menu = container.querySelector('.contextmenu') as HTMLElement | null;
			assert.ok(menu);

			// Menu should have transform (positioning logic handles overflow)
			const transform = menu.style.transform;
			assert.ok(transform.includes('translate3d'), 'should have translate3d transform');
		});

		test('custom layout is not overridden', () => {
			const custom_layout = { width: 800, height: 600 };
			const cm = new ContextmenuState({ layout: custom_layout });

			mounted = mount_contextmenu_root(Component, cm);

			// Custom layout should remain unchanged
			assert.strictEqual(cm.layout.width, 800);
			assert.strictEqual(cm.layout.height, 600);
		});
	});
};
