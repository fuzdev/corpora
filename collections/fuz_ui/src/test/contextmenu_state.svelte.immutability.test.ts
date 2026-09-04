import { describe, test, assert, beforeEach } from 'vitest';

import { ContextmenuState, EntryState, SubmenuState } from '$lib/contextmenu_state.svelte.ts';
import { add_test_entry } from './contextmenu_state_test_helpers.ts';

describe('ContextmenuState - Immutability', () => {
	let contextmenu: ContextmenuState;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
	});

	describe('items array immutability', () => {
		test('adding entry to root menu creates new items array reference', () => {
			const old_items = contextmenu.root_menu.items;
			const entry = new EntryState(contextmenu.root_menu, () => () => {});
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, entry];

			assert.notStrictEqual(contextmenu.root_menu.items, old_items);
			assert.deepEqual(old_items, []); // old reference unchanged
			assert.strictEqual(contextmenu.root_menu.items.length, 1);
		});

		test('adding submenu to root menu creates new items array reference', () => {
			const old_items = contextmenu.root_menu.items;
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, submenu];

			assert.notStrictEqual(contextmenu.root_menu.items, old_items);
			assert.deepEqual(old_items, []); // old reference unchanged
			assert.strictEqual(contextmenu.root_menu.items.length, 1);
		});

		test('nested submenu items remain immutable', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const old_submenu_items = submenu.items;

			// Manually add entry to submenu (simulating add_entry behavior)
			const entry = new EntryState(submenu, () => () => {});
			submenu.items = [...submenu.items, entry];

			assert.notStrictEqual(submenu.items, old_submenu_items);
			assert.deepEqual(old_submenu_items, []);
		});

		test('multiple additions each create new references', () => {
			const ref1 = contextmenu.root_menu.items;
			const entry1 = new EntryState(contextmenu.root_menu, () => () => {});
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, entry1];

			const ref2 = contextmenu.root_menu.items;
			assert.notStrictEqual(ref2, ref1);
			const entry2 = new EntryState(contextmenu.root_menu, () => () => {});
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, entry2];

			const ref3 = contextmenu.root_menu.items;
			assert.notStrictEqual(ref3, ref2);
			assert.notStrictEqual(ref3, ref1);
		});
	});

	describe('selections array immutability', () => {
		let entry1: EntryState;

		beforeEach(() => {
			entry1 = add_test_entry(contextmenu.root_menu);
			add_test_entry(contextmenu.root_menu); // sibling so select_next/select_previous can move
		});

		test('select creates new selections array reference', () => {
			const old_selections = contextmenu.selections;
			contextmenu.select(entry1);

			assert.notStrictEqual(contextmenu.selections, old_selections);
			assert.deepEqual(old_selections, []); // old reference unchanged
			assert.strictEqual(contextmenu.selections.length, 1);
		});

		test('select with same item keeps same reference', () => {
			contextmenu.select(entry1);
			const selections_ref = contextmenu.selections;
			contextmenu.select(entry1);

			assert.strictEqual(contextmenu.selections, selections_ref);
		});

		test('select_next creates new selections array reference', () => {
			contextmenu.select(entry1);
			const old_selections = contextmenu.selections;
			contextmenu.select_next();

			assert.notStrictEqual(contextmenu.selections, old_selections);
			assert.deepEqual(old_selections, [entry1]); // old reference unchanged
		});

		test('select_previous creates new selections array reference', () => {
			contextmenu.select(entry1);
			const old_selections = contextmenu.selections;
			contextmenu.select_previous();

			assert.notStrictEqual(contextmenu.selections, old_selections);
			assert.deepEqual(old_selections, [entry1]); // old reference unchanged
		});

		test('collapse_selected creates new selections array reference', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			add_test_entry(submenu);
			contextmenu.root_menu.items = [submenu];

			contextmenu.select(submenu);
			contextmenu.expand_selected();
			const old_selections = contextmenu.selections;
			contextmenu.collapse_selected();

			assert.notStrictEqual(contextmenu.selections, old_selections);
			assert.strictEqual(old_selections.length, 2); // old reference unchanged
		});

		test('expand_selected creates new selections array reference', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			add_test_entry(submenu);
			contextmenu.root_menu.items = [submenu];

			contextmenu.select(submenu);
			const old_selections = contextmenu.selections;
			contextmenu.expand_selected();

			assert.notStrictEqual(contextmenu.selections, old_selections);
			assert.deepEqual(old_selections, [submenu]); // old reference unchanged
		});

		test('open clears selections with new array reference', () => {
			contextmenu.select(entry1);
			const old_selections = contextmenu.selections;
			contextmenu.open([], 0, 0);

			assert.notStrictEqual(contextmenu.selections, old_selections);
			assert.deepEqual(old_selections, [entry1]); // old reference unchanged
			assert.deepEqual(contextmenu.selections, []);
		});
	});

	describe('params array immutability', () => {
		test('open creates new params array reference', () => {
			const params1 = [
				{ snippet: 'text' as const, props: { content: 'A', icon: '1', run: () => {} } }
			];
			contextmenu.open(params1, 0, 0);

			const old_params = contextmenu.params;
			const params2 = [
				{ snippet: 'text' as const, props: { content: 'B', icon: '2', run: () => {} } }
			];
			contextmenu.open(params2, 10, 10);

			assert.notStrictEqual(contextmenu.params, old_params);
			assert.strictEqual(contextmenu.params, params2);
		});
	});

	describe('concurrent read safety', () => {
		test('captured items reference unaffected by subsequent modifications', () => {
			const entry1 = new EntryState(contextmenu.root_menu, () => () => {});
			contextmenu.root_menu.items = [entry1];

			const captured_items = contextmenu.root_menu.items;
			assert.strictEqual(captured_items.length, 1);

			// Add more entries
			const entry2 = new EntryState(contextmenu.root_menu, () => () => {});
			contextmenu.root_menu.items = [...contextmenu.root_menu.items, entry2];

			// Captured reference should still have original data
			assert.strictEqual(captured_items.length, 1);
			assert.strictEqual(captured_items[0], entry1);

			// New reference has updated data
			assert.strictEqual(contextmenu.root_menu.items.length, 2);
		});

		test('captured selections reference unaffected by subsequent selections', () => {
			const entry1 = add_test_entry(contextmenu.root_menu);
			const entry2 = add_test_entry(contextmenu.root_menu);

			contextmenu.select(entry1);
			const captured_selections = contextmenu.selections;
			assert.strictEqual(captured_selections.length, 1);
			assert.strictEqual(captured_selections[0], entry1);

			// Change selection
			contextmenu.select(entry2);

			// Captured reference should still have original data
			assert.strictEqual(captured_selections.length, 1);
			assert.strictEqual(captured_selections[0], entry1);

			// New reference has updated data
			assert.strictEqual(contextmenu.selections.length, 1);
			assert.strictEqual(contextmenu.selections[0], entry2);
		});

		test('iterating items while modifying selections is safe', () => {
			for (let i = 0; i < 5; i++) add_test_entry(contextmenu.root_menu);

			// Capture items reference before iteration
			const items_snapshot = contextmenu.root_menu.items;

			// Iterate and modify selections (different array)
			const results: Array<boolean> = [];
			for (const item of items_snapshot) {
				contextmenu.select(item);
				results.push(item.selected);
			}

			// All items should have been processed and selected
			assert.strictEqual(results.length, 5);
			assert.deepEqual(results, [true, true, true, true, true]);

			// Original snapshot should be unchanged
			assert.strictEqual(items_snapshot.length, 5);
		});

		test('rapid state changes maintain reference integrity', () => {
			const entry = add_test_entry(contextmenu.root_menu);

			const refs: Array<any> = [];

			// Capture references during rapid changes
			refs.push(contextmenu.selections);
			contextmenu.select(entry);

			refs.push(contextmenu.selections);
			contextmenu.open([], 0, 0);

			refs.push(contextmenu.selections);
			contextmenu.select(entry);

			refs.push(contextmenu.selections);

			// All captured references should be different
			const unique_refs = new Set(refs);
			assert.strictEqual(unique_refs.size, 4);
		});
	});

	describe('operations that preserve references', () => {
		test('select with same item preserves selections reference', () => {
			const entry = add_test_entry(contextmenu.root_menu);

			contextmenu.select(entry);
			const ref = contextmenu.selections;

			// Select same item again
			contextmenu.select(entry);

			assert.strictEqual(contextmenu.selections, ref);
		});

		test('close when already closed preserves state', () => {
			assert.strictEqual(contextmenu.opened, false);

			const items_ref = contextmenu.root_menu.items;
			const selections_ref = contextmenu.selections;

			contextmenu.close();

			// References should be unchanged (early return)
			assert.strictEqual(contextmenu.root_menu.items, items_ref);
			assert.strictEqual(contextmenu.selections, selections_ref);
		});

		test('collapse when cannot collapse preserves selections reference', () => {
			const entry = add_test_entry(contextmenu.root_menu);

			contextmenu.select(entry);
			const ref = contextmenu.selections;

			// Try to collapse (should be no-op at root level)
			contextmenu.collapse_selected();

			assert.strictEqual(contextmenu.selections, ref);
		});

		test('expand when cannot expand preserves selections reference', () => {
			const entry = add_test_entry(contextmenu.root_menu);

			contextmenu.select(entry);
			const ref = contextmenu.selections;

			// Try to expand non-menu item (should be no-op)
			contextmenu.expand_selected();

			assert.strictEqual(contextmenu.selections, ref);
		});
	});
});
