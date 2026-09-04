import { describe, test, assert, beforeEach } from 'vitest';

import {
	ContextmenuState,
	EntryState,
	SubmenuState,
	RootMenuState
} from '$lib/contextmenu_state.svelte.ts';
import { add_test_entry, add_test_submenu } from './contextmenu_state_test_helpers.ts';

describe('ContextmenuState - Structure', () => {
	let contextmenu: ContextmenuState;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
	});

	describe('menu structure', () => {
		test('EntryState initializes correctly', () => {
			const run = () => {};
			const entry = new EntryState(contextmenu.root_menu, () => run);

			assert.strictEqual(entry.is_menu, false);
			assert.strictEqual(entry.menu, contextmenu.root_menu);
			assert.strictEqual(entry.selected, false);
			assert.strictEqual(entry.run(), run);
			assert.strictEqual(entry.pending, false);
			assert.strictEqual(entry.error_message, null);
			assert.strictEqual(entry.promise, null);
		});

		test('SubmenuState initializes correctly', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);

			assert.strictEqual(submenu.is_menu, true);
			assert.strictEqual(submenu.menu, contextmenu.root_menu);
			assert.strictEqual(submenu.depth, 2);
			assert.strictEqual(submenu.selected, false);
			assert.deepEqual(submenu.items, []);
		});

		test('RootMenuState initializes correctly', () => {
			const root = new RootMenuState();

			assert.strictEqual(root.is_menu, true);
			assert.strictEqual(root.menu, null);
			assert.strictEqual(root.depth, 1);
			assert.deepEqual(root.items, []);
		});

		test('nested menu hierarchy', () => {
			const submenu1 = new SubmenuState(contextmenu.root_menu, 2);
			const submenu2 = new SubmenuState(submenu1, 3);
			const entry = new EntryState(submenu2, () => () => {});

			assert.strictEqual(entry.menu, submenu2);
			assert.strictEqual(submenu2.menu, submenu1);
			assert.strictEqual(submenu1.menu, contextmenu.root_menu);
			assert.strictEqual(contextmenu.root_menu.menu, null);
		});

		test('deep nesting (5+ levels) works correctly', () => {
			// Create a 6-level deep menu structure
			const submenu1 = new SubmenuState(contextmenu.root_menu, 2);
			const submenu2 = new SubmenuState(submenu1, 3);
			const submenu3 = new SubmenuState(submenu2, 4);
			const submenu4 = new SubmenuState(submenu3, 5);
			const submenu5 = new SubmenuState(submenu4, 6);
			const entry = new EntryState(submenu5, () => () => {});

			// Verify depth property
			assert.strictEqual(submenu1.depth, 2);
			assert.strictEqual(submenu2.depth, 3);
			assert.strictEqual(submenu3.depth, 4);
			assert.strictEqual(submenu4.depth, 5);
			assert.strictEqual(submenu5.depth, 6);

			// Verify hierarchy chain
			assert.strictEqual(entry.menu, submenu5);
			assert.strictEqual(submenu5.menu, submenu4);
			assert.strictEqual(submenu4.menu, submenu3);
			assert.strictEqual(submenu3.menu, submenu2);
			assert.strictEqual(submenu2.menu, submenu1);
			assert.strictEqual(submenu1.menu, contextmenu.root_menu);
		});

		test('empty menus at various depths handled correctly', () => {
			const submenu1 = new SubmenuState(contextmenu.root_menu, 2);
			const submenu2 = new SubmenuState(submenu1, 3);
			const submenu3 = new SubmenuState(submenu2, 4);

			// All submenus are empty
			assert.strictEqual(submenu1.items.length, 0);
			assert.strictEqual(submenu2.items.length, 0);
			assert.strictEqual(submenu3.items.length, 0);

			// Can still navigate structure
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, submenu1];
			submenu1.items = [...submenu1.items, submenu2];
			submenu2.items = [...submenu2.items, submenu3];

			// Verify structure is intact
			assert.strictEqual(contextmenu.root_menu.items[0]!, submenu1);
			assert.strictEqual(submenu1.items[0]!, submenu2);
			assert.strictEqual(submenu2.items[0]!, submenu3);
		});

		test('menu hierarchy validation', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const entry = new EntryState(submenu, () => () => {});

			// Root menu has no parent
			assert.strictEqual(contextmenu.root_menu.menu, null);

			// Submenu's parent is root
			assert.strictEqual(submenu.menu, contextmenu.root_menu);

			// Entry's parent is submenu
			assert.strictEqual(entry.menu, submenu);

			// Entry is not a menu
			assert.strictEqual(entry.is_menu, false);

			// Submenu and root are menus
			assert.strictEqual(submenu.is_menu, true);
			assert.strictEqual(contextmenu.root_menu.is_menu, true);
		});

		test('circular reference prevention', () => {
			// Verify that the structure doesn't allow circular references
			const submenu1 = new SubmenuState(contextmenu.root_menu, 2);
			const submenu2 = new SubmenuState(submenu1, 3);

			// Menu property is set at construction and shouldn't create cycles
			assert.strictEqual(submenu1.menu, contextmenu.root_menu);
			assert.strictEqual(submenu2.menu, submenu1);

			// Items array doesn't reference parents
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, submenu1];
			submenu1.items = [...submenu1.items, submenu2];

			// Verify no cycles exist by walking up the chain
			let current: any = submenu2;
			let depth = 0;
			while (current && depth < 10) {
				current = current.menu;
				depth++;
			}
			assert.strictEqual(depth, 3, 'Should traverse root → submenu1 → submenu2 (3 hops to null)');
		});
	});

	describe('reset_items', () => {
		test('resets entry promise and error', () => {
			const entry = new EntryState(contextmenu.root_menu, () => () => {});
			entry.promise = Promise.resolve();
			entry.error_message = 'error';

			contextmenu.reset_items([entry]);

			assert.strictEqual(entry.promise, null);
			assert.strictEqual(entry.error_message, null);
		});

		test('resets entry pending flag', () => {
			const entry = new EntryState(contextmenu.root_menu, () => () => {});
			entry.promise = Promise.resolve();
			entry.pending = true;

			contextmenu.reset_items([entry]);

			assert.strictEqual(entry.promise, null);
			assert.strictEqual(entry.pending, false);
		});

		test('recursively resets submenu items', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const entry = add_test_entry(submenu);
			entry.promise = Promise.resolve();
			entry.error_message = 'error';

			contextmenu.reset_items([submenu]);

			assert.strictEqual(entry.promise, null);
			assert.strictEqual(entry.error_message, null);
		});

		test('handles empty items array', () => {
			contextmenu.reset_items([]);
			// Should not throw
		});

		test('handles deeply nested structure', () => {
			const submenu1 = new SubmenuState(contextmenu.root_menu, 2);
			const submenu2 = add_test_submenu(submenu1);
			const entry = add_test_entry(submenu2);
			entry.error_message = 'error';

			contextmenu.reset_items([submenu1]);

			assert.strictEqual(entry.error_message, null);
		});

		test('reset preserves structure', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const entry1 = add_test_entry(submenu);
			const entry2 = add_test_entry(submenu);
			entry1.error_message = 'error1';
			entry2.error_message = 'error2';

			contextmenu.reset_items([submenu]);

			// Structure preserved
			assert.strictEqual(submenu.items.length, 2);
			assert.strictEqual(submenu.items[0], entry1);
			assert.strictEqual(submenu.items[1], entry2);

			// State cleared
			assert.strictEqual(entry1.error_message, null);
			assert.strictEqual(entry2.error_message, null);
		});

		test('reset clears all async state', () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {});
			entry.promise = Promise.resolve({ ok: true });
			entry.pending = true;
			entry.error_message = 'async error';

			contextmenu.reset_items([entry]);

			// All async-related state should be cleared
			assert.strictEqual(entry.promise, null);
			assert.strictEqual(entry.pending, false);
			assert.strictEqual(entry.error_message, null);
		});
	});
});
