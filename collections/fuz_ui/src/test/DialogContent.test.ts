/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';

import './dialog_test_helpers.ts'; // polyfills `<dialog>` modal methods for jsdom
import DialogHarness from './DialogHarness.svelte';
import DialogCustomCloseHarness from './DialogCustomCloseHarness.svelte';
import { mount_component, unmount_component, create_mouse_event } from './test_helpers.ts';

let mounted: { instance: any; container: HTMLElement } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount_component(mounted.instance, mounted.container);
		mounted = null;
	}
});

const mount_harness = (
	dialog_props: Record<string, any> = {},
	content_props: Record<string, any> = {}
): HTMLElement => {
	mounted = mount_component(DialogHarness as any, { dialog_props, content_props });
	flushSync();
	return mounted.container;
};

describe('DialogContent', () => {
	test('renders the default close button', () => {
		const container = mount_harness();
		assert(container.querySelector('button[aria-label="close"]') instanceof HTMLButtonElement);
	});

	test('close_button={false} removes the close button', () => {
		const container = mount_harness({}, { close_button: false });
		assert.equal(container.querySelector('button[aria-label="close"]'), null);
	});

	test('the default close button closes the dialog', () => {
		const onclose = vi.fn();
		const container = mount_harness({ onclose });
		const button = container.querySelector('button[aria-label="close"]');
		assert(button instanceof HTMLButtonElement);
		button.dispatchEvent(create_mouse_event('click'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 1);
	});

	test('a custom close_button snippet replaces the default button', () => {
		mounted = mount_component(DialogCustomCloseHarness as any, {});
		flushSync();
		const { container } = mounted;
		const custom = container.querySelector('[data-testid="custom-close"]');
		assert(custom instanceof HTMLButtonElement);
		// only one close button -- the custom one replaces the default, not in addition to it
		assert.equal(container.querySelectorAll('button[aria-label="close"]').length, 1);
		// the bag carries the default's a11y into the custom button
		assert.equal(custom.getAttribute('aria-label'), 'close');
	});

	test('the attrs bag wires onclick to close the dialog', () => {
		const onclose = vi.fn();
		mounted = mount_component(DialogCustomCloseHarness as any, { dialog_props: { onclose } });
		flushSync();
		const button = mounted.container.querySelector('[data-testid="custom-close"]');
		assert(button instanceof HTMLButtonElement);
		button.dispatchEvent(create_mouse_event('click'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 1);
	});

	test('the attrs bag carries the default placement and styling', () => {
		mounted = mount_component(DialogCustomCloseHarness as any, {});
		flushSync();
		const button = mounted.container.querySelector('[data-testid="custom-close"]');
		assert(button instanceof HTMLButtonElement);
		// corner-anchored placement travels as inline style (not a scoped class, which
		// wouldn't match a consumer-defined snippet)
		assert(button.getAttribute('style')?.includes('position: absolute'));
		// global fuz_css icon-button styling rides along too
		assert(button.classList.contains('icon_button'));
	});

	test('the close button renders after the content so it does not take initial focus', () => {
		// the harness defines its snippet/content in markup order content-then-button, but
		// DialogContent renders `children` before `close_button`, so the button follows in the DOM
		const container = mount_harness();
		const content = container.querySelector('[data-testid="content"]');
		const button = container.querySelector('button[aria-label="close"]');
		assert(content instanceof HTMLElement);
		assert(button instanceof HTMLButtonElement);
		assert((content.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
	});

	test('pane defaults on and is removable with pane={false}', () => {
		assert(mount_harness().querySelector('.pane') instanceof HTMLElement);
	});

	test('pane={false} drops the .pane class but keeps the content', () => {
		const container = mount_harness({}, { pane: false });
		assert.equal(container.querySelector('.pane'), null);
		assert(container.querySelector('[data-testid="content"]') instanceof HTMLElement);
	});

	test('a press inside the registered surface does not close, even with pane={false}', () => {
		const onclose = vi.fn();
		const container = mount_harness({ onclose }, { pane: false });
		const content = container.querySelector('[data-testid="content"]');
		assert(content instanceof HTMLElement);
		content.dispatchEvent(create_mouse_event('mousedown'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 0);
	});

	test('a press outside the surface closes', () => {
		const onclose = vi.fn();
		const container = mount_harness({ onclose });
		const wrapper = container.querySelector('.dialog-wrapper');
		assert(wrapper instanceof HTMLElement);
		wrapper.dispatchEvent(create_mouse_event('mousedown'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 1);
	});
});
