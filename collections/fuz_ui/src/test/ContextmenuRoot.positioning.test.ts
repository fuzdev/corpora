/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';

import { create_shared_positioning_tests } from './contextmenu_test_positioning.ts';
import ContextmenuRoot from '$lib/ContextmenuRoot.svelte';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

create_shared_positioning_tests(ContextmenuRoot, 'ContextmenuRoot');
