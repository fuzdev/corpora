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
import { CONTEXTMENU_DEFAULT_LONGPRESS_DURATION } from '$lib/contextmenu_helpers.ts';
import { create_shared_link_entry_tests } from './contextmenu_test_link_entries.ts';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

// Run shared link entry tests with longpress requirement
create_shared_link_entry_tests(
	ContextmenuRootForSafariCompatibility,
	'ContextmenuRootForSafariCompatibility',
	{
		requires_longpress: true
	}
);

// Safari-specific additional tests
describe('ContextmenuRootForSafariCompatibility - Link Entry Handling (Safari-Specific)', () => {
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

	describe('link entry with longpress', () => {
		test('link entry works with longpress on touch devices', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'link', props: { href: 'https://fuz.dev' } }
			]);

			// Longpress to open menu
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Trigger longpress to open contextmenu
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			assert.strictEqual(contextmenu.opened, true);
			flushSync();

			// Link should be rendered with formatted URL (format_url strips protocol)
			const link = container.querySelector('a[href="https://fuz.dev"]');
			assert.ok(link);
			assert.ok(link.textContent.includes('fuz.dev'));
		});

		test('long-pressing link opens fuz contextmenu with link entry', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container, contextmenu } = mounted;

			// Create an actual link element as the target
			const link_target = document.createElement('a');
			link_target.href = 'https://fuz.dev';
			link_target.textContent = 'A link';
			container.appendChild(link_target);

			await setup_contextmenu_attachment(link_target, [
				{ snippet: 'link', props: { href: 'https://fuz.dev', content: 'Open in new tab' } }
			]);

			// Longpress on the link itself
			const touchstart = create_touch_event('touchstart', [
				{ clientX: 100, clientY: 200, target: link_target }
			]);
			set_event_target(touchstart, link_target);
			window.dispatchEvent(touchstart);

			// Trigger longpress to open contextmenu on link element
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();

			// Should open contextmenu
			assert.strictEqual(contextmenu.opened, true);
			flushSync();

			// Menu should contain link entry
			const menu_link = container.querySelector('.contextmenu a[href="https://fuz.dev"]');
			assert.ok(menu_link);
		});

		test('right-clicking opened link entry shows native menu', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'link', props: { href: 'https://fuz.dev', content: 'Example Link' } }
			]);

			// Open menu
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Trigger longpress to open contextmenu
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			flushSync();

			const menu_link = container.querySelector('a[href="https://fuz.dev"]');
			assert.ok(menu_link);

			// Right-click on the link entry in the menu
			const ctxmenu = create_contextmenu_event(150, 250);
			set_event_target(ctxmenu, menu_link);
			menu_link.dispatchEvent(ctxmenu);

			// Should not prevent default - allows native menu
			assert.strictEqual(ctxmenu.defaultPrevented, false);
		});
	});

	describe('link entry in nested menus', () => {
		test('link entry in submenu allows native contextmenu', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			// Setup contextmenu with nested structure
			// Note: This is a simplified test - actual submenu implementation may differ
			await setup_contextmenu_attachment(target, [
				{ snippet: 'text', props: { content: 'Parent Item', icon: '📁', run: () => undefined } },
				{ snippet: 'link', props: { href: 'https://fuz.dev', content: 'Nested Link' } }
			]);

			// Open menu
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Trigger longpress to open contextmenu
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			flushSync();

			const link = container.querySelector('a[href="https://fuz.dev"]');
			assert.ok(link);

			// Right-click on nested link
			const ctxmenu = create_contextmenu_event(150, 250);
			set_event_target(ctxmenu, link);
			link.dispatchEvent(ctxmenu);

			// Should allow native menu (not prevented)
			assert.strictEqual(ctxmenu.defaultPrevented, false);
		});

		test('multiple link entries each allow individual native access', async () => {
			mounted = mount_contextmenu_root(ContextmenuRootForSafariCompatibility);

			const { container } = mounted;

			const target = document.createElement('div');
			container.appendChild(target);

			await setup_contextmenu_attachment(target, [
				{ snippet: 'link', props: { href: 'https://example1.com', content: 'Link 1' } },
				{ snippet: 'link', props: { href: 'https://example2.com', content: 'Link 2' } },
				{ snippet: 'link', props: { href: 'https://example3.com', content: 'Link 3' } }
			]);

			// Open menu
			const touchstart = create_touch_event('touchstart', [{ clientX: 100, clientY: 200, target }]);
			set_event_target(touchstart, target);
			window.dispatchEvent(touchstart);

			// Trigger longpress to open contextmenu
			vi.advanceTimersByTime(CONTEXTMENU_DEFAULT_LONGPRESS_DURATION);
			await tick();
			flushSync();

			// Test each link allows native menu
			const links = container.querySelectorAll('.contextmenu a');
			assert.strictEqual(links.length, 3);

			for (const link of links) {
				const ctxmenu = create_contextmenu_event(150, 250);
				set_event_target(ctxmenu, link);
				link.dispatchEvent(ctxmenu);

				// Each should allow native menu
				assert.strictEqual(ctxmenu.defaultPrevented, false);
			}
		});
	});
});
