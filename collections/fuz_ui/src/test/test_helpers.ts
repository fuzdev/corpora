/**
 * Shared test utilities for vitest tests.
 * Provides helpers for component mounting and DOM event creation.
 */

import { mount, unmount, type Component } from 'svelte';

/**
 * Mount a Svelte component for testing.
 * Creates a container div, appends it to document.body, and mounts the component.
 */
export const mount_component = <TProps extends Record<string, any>>(
	Component: Component<TProps>,
	props: TProps
): { instance: any; container: HTMLElement } => {
	const container = document.createElement('div');
	document.body.appendChild(container);

	const instance = mount(Component, {
		target: container,
		props
	});

	return { instance, container };
};

/**
 * Unmount a component and remove its container from the DOM.
 */
export const unmount_component = async (instance: any, container: HTMLElement): Promise<void> => {
	await unmount(instance);
	container.remove();
};

/**
 * Create a contextmenu (rightclick) mouse event.
 */
export const create_contextmenu_event = (
	x: number,
	y: number,
	options: MouseEventInit = {}
): MouseEvent => {
	return new MouseEvent('contextmenu', {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		...options
	});
};

/**
 * Create a keyboard event.
 */
export const create_keyboard_event = (
	key: string,
	options: KeyboardEventInit = {}
): KeyboardEvent => {
	return new KeyboardEvent('keydown', {
		bubbles: true,
		cancelable: true,
		key,
		...options
	});
};

/**
 * Create a generic mouse event.
 */
export const create_mouse_event = (type: string, options: MouseEventInit = {}): MouseEvent => {
	return new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		...options
	});
};

/**
 * Set the target property on an event (for testing).
 * The target property is readonly, so we need to use Object.defineProperty.
 */
export const set_event_target = (event: Event, target: EventTarget): void => {
	Object.defineProperty(event, 'target', {
		value: target,
		enumerable: true,
		configurable: true
	});
};

/**
 * Create a touch event with one or more touches.
 */
export const create_touch_event = (
	type: string,
	touches: Array<{ clientX: number; clientY: number; target?: EventTarget }>,
	options: TouchEventInit = {}
): TouchEvent => {
	// Create Touch objects (mocked for testing)
	const touch_objects: Array<Touch> = touches.map((touch, index) => ({
		identifier: index,
		clientX: touch.clientX,
		clientY: touch.clientY,
		screenX: touch.clientX,
		screenY: touch.clientY,
		pageX: touch.clientX,
		pageY: touch.clientY,
		radiusX: 0,
		radiusY: 0,
		rotationAngle: 0,
		force: 1,
		target: touch.target ?? document.body
	}));

	return new TouchEvent(type, {
		bubbles: true,
		cancelable: true,
		touches: touch_objects,
		targetTouches: touch_objects,
		changedTouches: touch_objects,
		...options
	});
};

/**
 * Overrides an event's readonly `timeStamp`, for testing time-based guards.
 */
export const set_event_time = (event: Event, time_stamp: number): void => {
	Object.defineProperty(event, 'timeStamp', { value: time_stamp, configurable: true });
};
