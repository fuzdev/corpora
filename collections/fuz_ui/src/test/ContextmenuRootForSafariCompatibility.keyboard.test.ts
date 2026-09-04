/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';

import { create_shared_keyboard_tests } from './contextmenu_test_keyboard.ts';
import ContextmenuRootForSafariCompatibility from '$lib/ContextmenuRootForSafariCompatibility.svelte';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

create_shared_keyboard_tests(
	ContextmenuRootForSafariCompatibility,
	'ContextmenuRootForSafariCompatibility',
	{ requires_longpress: true }
);
