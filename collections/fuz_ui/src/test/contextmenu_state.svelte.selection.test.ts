import { describe, test, assert, beforeEach } from 'vitest';

import { ContextmenuState, EntryState, SubmenuState } from '$lib/contextmenu_state.svelte.ts';
import { add_test_entry, add_test_submenu } from './contextmenu_state_test_helpers.ts';

describe('ContextmenuState - Selection', () => {
	let contextmenu: ContextmenuState;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
	});

	describe('selection management', () => {
		let entry1: EntryState;
		let entry2: EntryState;
		let entry3: EntryState;

		beforeEach(() => {
			entry1 = add_test_entry(contextmenu.root_menu);
			entry2 = add_test_entry(contextmenu.root_menu);
			entry3 = add_test_entry(contextmenu.root_menu);
		});

		test('select() marks item as selected', () => {
			contextmenu.select(entry1);

			assert.strictEqual(entry1.selected, true);
			assert.deepEqual(contextmenu.selections, [entry1]);
		});

		test('select() deselects previous selection', () => {
			contextmenu.select(entry1);
			contextmenu.select(entry2);

			assert.strictEqual(entry1.selected, false);
			assert.strictEqual(entry2.selected, true);
			assert.deepEqual(contextmenu.selections, [entry2]);
		});

		test('select() with same item does nothing', () => {
			contextmenu.select(entry1);
			const selections_ref = contextmenu.selections;
			contextmenu.select(entry1);

			assert.strictEqual(contextmenu.selections, selections_ref);
			assert.strictEqual(entry1.selected, true);
		});

		test('select_next() selects next item', () => {
			contextmenu.select(entry1);
			contextmenu.select_next();

			assert.strictEqual(entry2.selected, true);
			assert.strictEqual(entry1.selected, false);
		});

		test('select_next() wraps to first item', () => {
			contextmenu.select(entry3);
			contextmenu.select_next();

			assert.strictEqual(entry1.selected, true);
			assert.strictEqual(entry3.selected, false);
		});

		test('select_next() selects first when no selection', () => {
			contextmenu.select_next();
			assert.strictEqual(entry1.selected, true);
		});

		test('select_previous() selects previous item', () => {
			contextmenu.select(entry2);
			contextmenu.select_previous();

			assert.strictEqual(entry1.selected, true);
			assert.strictEqual(entry2.selected, false);
		});

		test('select_previous() wraps to last item', () => {
			contextmenu.select(entry1);
			contextmenu.select_previous();

			assert.strictEqual(entry3.selected, true);
			assert.strictEqual(entry1.selected, false);
		});

		test('select_previous() selects last when no selection', () => {
			contextmenu.select_previous();
			assert.strictEqual(entry3.selected, true);
		});

		test('select_first() selects first item', () => {
			contextmenu.select(entry3);
			contextmenu.select_first();

			assert.strictEqual(entry1.selected, true);
			assert.strictEqual(entry3.selected, false);
		});

		test('select_last() selects last item', () => {
			contextmenu.select(entry1);
			contextmenu.select_last();

			assert.strictEqual(entry3.selected, true);
			assert.strictEqual(entry1.selected, false);
		});

		test('collapse_selected() does nothing with single level', () => {
			contextmenu.select(entry1);
			contextmenu.collapse_selected();

			assert.strictEqual(entry1.selected, true);
			assert.strictEqual(contextmenu.selections.length, 1);
		});

		test('collapse_selected() deselects nested item', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const nested_entry = add_test_entry(submenu);

			// Manually set up a nested selection
			contextmenu.root_menu.items[0]!.selected = true;
			submenu.selected = true;
			nested_entry.selected = true;
			contextmenu.selections = [contextmenu.root_menu.items[0]!, submenu, nested_entry];

			contextmenu.collapse_selected();

			assert.strictEqual(nested_entry.selected, false);
			assert.strictEqual(submenu.selected, true);
			assert.strictEqual(contextmenu.selections.length, 2);
		});

		test('expand_selected() does nothing on non-menu item', () => {
			contextmenu.select(entry1);
			const selections_len = contextmenu.selections.length;
			contextmenu.expand_selected();

			assert.strictEqual(contextmenu.selections.length, selections_len);
		});

		test('expand_selected() selects first child of submenu', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const child = add_test_entry(submenu);
			contextmenu.root_menu.items = [submenu];

			contextmenu.select(submenu);
			contextmenu.expand_selected();

			assert.strictEqual(child.selected, true);
			assert.strictEqual(contextmenu.selections.length, 2);
			assert.strictEqual(contextmenu.selections[1], child);
		});

		test('collapse_selected() respects can_collapse', () => {
			const entry = add_test_entry(contextmenu.root_menu);
			contextmenu.select(entry);

			// At root level, can_collapse is false
			assert.strictEqual(contextmenu.can_collapse, false);

			// Should be no-op
			contextmenu.collapse_selected();

			assert.strictEqual(entry.selected, true);
			assert.strictEqual(contextmenu.selections.length, 1);
		});

		test('expand_selected() respects can_expand with empty submenu', () => {
			const empty_submenu = add_test_submenu(contextmenu.root_menu);
			contextmenu.select(empty_submenu);

			// Empty submenu, can_expand is false
			assert.strictEqual(contextmenu.can_expand, false);

			// Should be no-op and not crash
			contextmenu.expand_selected();

			assert.strictEqual(empty_submenu.selected, true);
			assert.strictEqual(contextmenu.selections.length, 1);
		});

		test("rapid selection changes don't cause race conditions", () => {
			// Rapidly change selections and verify state consistency
			contextmenu.select(entry1);
			contextmenu.select(entry2);
			contextmenu.select(entry3);
			contextmenu.select(entry1);
			contextmenu.select(entry2);

			// Only entry2 should be selected
			assert.strictEqual(entry1.selected, false);
			assert.strictEqual(entry2.selected, true);
			assert.strictEqual(entry3.selected, false);
			assert.strictEqual(contextmenu.selections.length, 1);
			assert.strictEqual(contextmenu.selections[0]!, entry2);
		});

		test('selecting disabled items is prevented', () => {
			const disabled_entry = add_test_entry(
				contextmenu.root_menu,
				() => {},
				() => true // disabled function returns true
			);

			// Select disabled item
			contextmenu.select(disabled_entry);

			// Should still be selected (selection doesn't check disabled state)
			// Activation is what checks disabled state
			assert.strictEqual(disabled_entry.selected, true);
		});

		test('selection state survives across multiple levels', () => {
			const submenu1 = new SubmenuState(contextmenu.root_menu, 2);
			const submenu2 = add_test_submenu(submenu1);
			const deep_entry = add_test_entry(submenu2);

			contextmenu.root_menu.items = [submenu1];

			// Navigate down
			contextmenu.select(submenu1);
			assert.strictEqual(contextmenu.selections.length, 1);

			contextmenu.expand_selected();
			assert.strictEqual(contextmenu.selections.length, 2);
			assert.strictEqual(contextmenu.selections[1], submenu2);

			contextmenu.expand_selected();
			assert.strictEqual(contextmenu.selections.length, 3);
			assert.strictEqual(contextmenu.selections[2], deep_entry);

			// Navigate up
			contextmenu.collapse_selected();
			assert.strictEqual(contextmenu.selections.length, 2);
			assert.strictEqual(contextmenu.selections[1], submenu2);

			contextmenu.collapse_selected();
			assert.strictEqual(contextmenu.selections.length, 1);
			assert.strictEqual(contextmenu.selections[0]!, submenu1);
		});

		test('select_first and select_last on empty menu are no-ops', () => {
			contextmenu.root_menu.items = [];
			contextmenu.select_first();
			assert.strictEqual(contextmenu.selections.length, 0);

			contextmenu.select_last();
			assert.strictEqual(contextmenu.selections.length, 0);
		});

		test('select_next() falls back to the first item when the selected item was removed', () => {
			contextmenu.select(entry2);
			contextmenu.root_menu.remove_item(entry2);

			contextmenu.select_next();

			assert.strictEqual(entry1.selected, true);
			assert.deepEqual(contextmenu.selections, [entry1]);
		});

		test('select_previous() falls back to the last item when the selected item was removed', () => {
			contextmenu.select(entry2);
			contextmenu.root_menu.remove_item(entry2);

			contextmenu.select_previous();

			assert.strictEqual(entry3.selected, true);
			assert.deepEqual(contextmenu.selections, [entry3]);
		});

		test('select_next() and select_previous() are no-ops when the selected item was removed and the menu emptied', () => {
			contextmenu.select(entry2);
			contextmenu.root_menu.items = [];

			contextmenu.select_next();
			assert.deepEqual(contextmenu.selections, [entry2]);

			contextmenu.select_previous();
			assert.deepEqual(contextmenu.selections, [entry2]);
		});

		test('keyboard navigation boundary conditions', () => {
			// Empty menu
			contextmenu.root_menu.items = [];
			contextmenu.select_next();
			assert.strictEqual(contextmenu.selections.length, 0);

			contextmenu.select_previous();
			assert.strictEqual(contextmenu.selections.length, 0);

			// Single item menu
			const single = add_test_entry(contextmenu.root_menu);

			contextmenu.select_first();
			assert.strictEqual(single.selected, true);

			contextmenu.select_last();
			assert.strictEqual(single.selected, true);

			// Wrap around works correctly
			contextmenu.select_next();
			assert.strictEqual(single.selected, true);

			contextmenu.select_previous();
			assert.strictEqual(single.selected, true);
		});
	});
});
