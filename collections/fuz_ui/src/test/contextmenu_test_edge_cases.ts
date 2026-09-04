/**
 * Shared edge case tests for contextmenu components.
 * Tests SVG elements, function snippets, rapid sequences, and other edge cases.
 */

import { describe, test, assert, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { unmount_component, create_contextmenu_event, set_event_target } from './test_helpers.ts';
import {
	mount_contextmenu_root,
	setup_contextmenu_attachment,
	type SharedTestOptions
} from './contextmenu_test_helpers.ts';

export const create_shared_edge_case_tests = (
	Component: any,
	component_name: string,
	_options: SharedTestOptions = {}
): void => {
	describe(`${component_name} - Edge Cases`, () => {
		let mounted: ReturnType<typeof mount_contextmenu_root> | null = null;

		afterEach(async () => {
			if (mounted) {
				await unmount_component(mounted.instance, mounted.container);
				mounted = null;
			}
		});

		test('handles SVG elements as targets', async () => {
			mounted = mount_contextmenu_root(Component);
			const { container, contextmenu } = mounted;

			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			svg.appendChild(rect);
			container.appendChild(svg);

			await setup_contextmenu_attachment(rect, [
				{ snippet: 'text', props: { content: 'SVG Test', icon: '🎨', run: () => undefined } }
			]);

			const event = create_contextmenu_event(100, 200);
			set_event_target(event, rect);
			window.dispatchEvent(event);

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(event.defaultPrevented, true);

			svg.remove();
		});

		test('handles function snippet params', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			const snippet = (() => {
				// Test snippet function
			}) as any;

			contextmenu.open([snippet], 100, 200);
			flushSync();

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.params[0]!, snippet);
		});

		test('handles empty params array', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			contextmenu.open([], 100, 200);
			flushSync();

			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.params.length, 0);
		});

		test('handles rapid open/close sequences', () => {
			mounted = mount_contextmenu_root(Component);

			const { contextmenu } = mounted;

			// Rapid open/close/open
			contextmenu.open([(() => undefined) as any], 50, 50);
			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.x, 50);

			contextmenu.close();
			assert.strictEqual(contextmenu.opened, false);

			contextmenu.open([(() => undefined) as any], 100, 100);
			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.x, 100);

			contextmenu.open([(() => undefined) as any], 150, 150);
			assert.strictEqual(contextmenu.opened, true);
			assert.strictEqual(contextmenu.x, 150);
		});

		test('handles mixed HTML and SVG targets', async () => {
			mounted = mount_contextmenu_root(Component);
			const { container, contextmenu } = mounted;

			// First open on HTML element
			const div = document.createElement('div');
			container.appendChild(div);
			await setup_contextmenu_attachment(div, [
				{ snippet: 'text', props: { content: 'HTML', icon: '📄', run: () => undefined } }
			]);

			const event1 = create_contextmenu_event(100, 100);
			set_event_target(event1, div);
			window.dispatchEvent(event1);

			assert.strictEqual(contextmenu.opened, true);
			contextmenu.close();

			// Then open on SVG element
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			container.appendChild(circle);
			await setup_contextmenu_attachment(circle, [
				{ snippet: 'text', props: { content: 'SVG', icon: '🎨', run: () => undefined } }
			]);

			const event2 = create_contextmenu_event(200, 200);
			set_event_target(event2, circle);
			window.dispatchEvent(event2);

			assert.strictEqual(contextmenu.opened, true);

			// Cleanup
			div.remove();
			circle.remove();
		});

		test('prevents contextmenu when no params available', () => {
			mounted = mount_contextmenu_root(Component);
			const { container, contextmenu } = mounted;

			const div = document.createElement('div');
			// Not setting up contextmenu params
			container.appendChild(div);

			const event = create_contextmenu_event(100, 200);
			set_event_target(event, div);
			window.dispatchEvent(event);

			assert.strictEqual(contextmenu.opened, false);
			assert.strictEqual(event.defaultPrevented, false);

			div.remove();
		});
	});
};
