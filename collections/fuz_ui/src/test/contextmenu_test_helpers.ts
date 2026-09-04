/**
 * Shared test utilities specific to contextmenu components.
 * Provides helpers for mounting contextmenu components and setting up actions.
 */

import { flushSync, type Component } from 'svelte';
import { contextmenu_attachment, ContextmenuState } from '$lib/contextmenu_state.svelte.ts';
import { mount_component } from './test_helpers.ts';

/**
 * Create a test contextmenu with standard layout dimensions.
 * This is the standard test setup used across contextmenu tests.
 */
export const create_test_contextmenu = (): ContextmenuState => {
	const cm = new ContextmenuState();
	cm.layout.width = 1024;
	cm.layout.height = 768;
	return cm;
};

/**
 * Mount a contextmenu root component with a contextmenu instance.
 * Provides default empty children snippet and merges additional props.
 *
 * @param Component - the contextmenu root component to mount (ContextmenuRoot or Safari variant)
 * @param contextmenu - optional contextmenu instance (uses default if not provided)
 * @param props - additional props to pass to the component
 */
export const mount_contextmenu_root = <TProps extends Record<string, any>>(
	Component: Component<TProps>,
	contextmenu?: ContextmenuState,
	props: Record<string, any> = {}
): { instance: any; container: HTMLElement; contextmenu: ContextmenuState } => {
	const cm = contextmenu || create_test_contextmenu();
	const result = mount_component(Component, {
		contextmenu: cm,
		children: (() => {
			// Empty children snippet
		}) as any,
		...props
	} as any);

	return { ...result, contextmenu: cm };
};

/**
 * Setup contextmenu attachment on an element with test params.
 * This registers the element so it responds to contextmenu events.
 *
 * Flushes pending Svelte effects so a freshly mounted root's window listeners
 * (e.g. the Safari-compat root's touch listener attachment) are live before the
 * test dispatches events. Async only for call-site compatibility - the many
 * existing `await`ed usages.
 *
 * @param element - the HTML or SVG element to setup
 * @param params - array of contextmenu params (entries, snippets, etc.)
 * @returns cleanup function to call when done
 */
export const setup_contextmenu_attachment = async (
	element: HTMLElement | SVGElement,
	params: Array<any>
): Promise<(() => void) | void> => {
	flushSync();
	return contextmenu_attachment(params)(element);
};

/**
 * Options for customizing shared test factories based on component variations.
 * Used by test factory modules in contextmenu_test_*.ts files.
 */
export interface SharedTestOptions {
	/**
	 * Whether the component requires longpress (touch) to open instead of contextmenu event.
	 * Set to true for Safari compatibility variant.
	 */
	requires_longpress?: boolean;
	/**
	 * Duration in milliseconds to advance timers for longpress detection.
	 * Only used when requires_longpress is true.
	 */
	longpress_duration?: number;
}
