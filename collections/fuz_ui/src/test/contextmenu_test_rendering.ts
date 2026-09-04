/**
 * Shared rendering tests for contextmenu components.
 * Tests DOM rendering, lifecycle, and layout element behavior.
 */

import { describe, test, assert, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { ContextmenuState, type ContextmenuActivateResult } from '$lib/contextmenu_state.svelte.ts';
import { unmount_component } from './test_helpers.ts';
import { mount_contextmenu_root, type SharedTestOptions } from './contextmenu_test_helpers.ts';

export const create_shared_rendering_tests = (
	Component: any,
	component_name: string,
	_options: SharedTestOptions = {}
): void => {
	describe(`${component_name} - Rendering`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
		});

		test('contextmenu not rendered when closed', () => {
			mounted = mount_contextmenu_root(Component);

			const { container } = mounted;

			const menu = container.querySelector('.contextmenu');
			assert.strictEqual(menu, null);
		});

		test('contextmenu rendered when opened', () => {
			mounted = mount_contextmenu_root(Component);

			const { container, contextmenu } = mounted;

			contextmenu.open([(() => undefined) as any], 100, 200);
			flushSync(); // Wait for DOM to update

			const menu = container.querySelector('.contextmenu');
			assert.ok(menu);
			assert.strictEqual(menu.getAttribute('role'), 'menu');
			assert.strictEqual(menu.getAttribute('aria-label'), 'context menu');
			assert.strictEqual(menu.getAttribute('tabindex'), '-1');
			assert.ok(menu.classList.contains('contextmenu'));
			assert.ok(menu.classList.contains('unstyled'));
			assert.ok(menu.classList.contains('pane'));
		});

		test('contextmenu_layout rendered when no custom layout', () => {
			mounted = mount_contextmenu_root(Component);

			const { container } = mounted;

			const layout = container.querySelector('.contextmenu-layout');
			assert.ok(layout);
			assert.strictEqual(layout.getAttribute('aria-hidden'), 'true');
		});

		test('contextmenu-layout not rendered with custom layout', () => {
			const custom_layout = { width: 800, height: 600 };
			const cm = new ContextmenuState({ layout: custom_layout });

			mounted = mount_contextmenu_root(Component, cm);

			const { container } = mounted;

			const layout = container.querySelector('.contextmenu-layout');
			assert.strictEqual(layout, null);
		});

		test('entry renders the pending animation during async activation and the error state on failure', async () => {
			mounted = mount_contextmenu_root(Component);

			const { container, contextmenu } = mounted;

			let reject!: (error: unknown) => void;
			const promise = new Promise<ContextmenuActivateResult>((_, r) => (reject = r));
			contextmenu.open(
				[{ snippet: 'text' as const, props: { content: 'Async', icon: '⏳', run: () => promise } }],
				100,
				200
			);
			flushSync();

			const item = container.querySelector('.contextmenu [role="menuitem"]');
			assert.ok(item);
			assert.strictEqual(container.querySelector('.pending-animation'), null);

			const entry = contextmenu.root_menu.items[0]!;
			assert.ok(!entry.is_menu);
			const activation = contextmenu.activate(entry);
			flushSync();

			assert.ok(container.querySelector('.pending-animation'));

			reject(new Error('boom'));
			await activation;
			flushSync();

			assert.strictEqual(container.querySelector('.pending-animation'), null);
			// failures keep the menu open and surface the message on the entry
			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(item.getAttribute('title'), 'Error: boom');
			assert.ok(item.textContent.includes('⚠️'));
		});
	});
};
