/**
 * @vitest-environment jsdom
 */
import { vi } from 'vitest';

import { create_shared_link_entry_tests } from './contextmenu_test_link_entries.ts';
import ContextmenuRoot from '$lib/ContextmenuRoot.svelte';

// ResizeObserver is not currently available in jsdom
class ResizeObserverMock {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

create_shared_link_entry_tests(ContextmenuRoot, 'ContextmenuRoot');
