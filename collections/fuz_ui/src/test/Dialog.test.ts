/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';

import './dialog_test_helpers.ts'; // polyfills `<dialog>` modal methods for jsdom
import Dialog from '$lib/Dialog.svelte';
import { mount_component, unmount_component, create_mouse_event } from './test_helpers.ts';

let mounted: { instance: any; container: HTMLElement } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount_component(mounted.instance, mounted.container);
		mounted = null;
	}
});

// an empty no-op children snippet, matching the contextmenu test pattern
const empty_children = (() => {}) as any;

const mount_dialog = (props: Record<string, any> = {}): HTMLDialogElement => {
	mounted = mount_component(Dialog as any, { children: empty_children, ...props });
	flushSync();
	const dialog = mounted.container.querySelector('dialog');
	assert(dialog instanceof HTMLDialogElement);
	return dialog;
};

describe('Dialog', () => {
	test('mounting opens the dialog via showModal', () => {
		const dialog = mount_dialog();
		assert(dialog.open);
	});

	test('cancel (Escape) closes and calls onclose once', () => {
		const onclose = vi.fn();
		const dialog = mount_dialog({ onclose });
		dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
		// a second dismissal is a no-op thanks to the `closing` guard
		dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
		flushSync();
		assert.equal(onclose.mock.calls.length, 1);
		assert(!dialog.open);
	});

	test('onbeforeclose returning false vetoes the close', () => {
		const onclose = vi.fn();
		const dialog = mount_dialog({ onclose, onbeforeclose: () => false });
		dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
		flushSync();
		assert.equal(onclose.mock.calls.length, 0);
		assert(dialog.open);
	});

	test('a press outside the content closes when dismissable', () => {
		const onclose = vi.fn();
		mount_dialog({ onclose });
		const wrapper = mounted!.container.querySelector('.dialog-wrapper');
		assert(wrapper instanceof HTMLElement);
		wrapper.dispatchEvent(create_mouse_event('mousedown'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 1);
	});

	test('a press outside does nothing when not dismissable', () => {
		const onclose = vi.fn();
		mount_dialog({ onclose, dismissable: false });
		const wrapper = mounted!.container.querySelector('.dialog-wrapper');
		assert(wrapper instanceof HTMLElement);
		wrapper.dispatchEvent(create_mouse_event('mousedown'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 0);
	});

	test('onbeforeclose vetoes a click-outside close', () => {
		const onclose = vi.fn();
		mount_dialog({ onclose, onbeforeclose: () => false });
		const wrapper = mounted!.container.querySelector('.dialog-wrapper');
		assert(wrapper instanceof HTMLElement);
		wrapper.dispatchEvent(create_mouse_event('mousedown'));
		flushSync();
		assert.equal(onclose.mock.calls.length, 0);
	});
});
