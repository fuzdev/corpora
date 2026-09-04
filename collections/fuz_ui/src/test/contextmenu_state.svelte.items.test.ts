import { describe, test, assert, beforeEach } from 'vitest';

import { EntryState, RootMenuState } from '$lib/contextmenu_state.svelte.ts';

/**
 * Direct tests for `ContextmenuItemsState` (via the concrete `RootMenuState`),
 * focusing on the invariant between the non-reactive source array and the
 * published immutable snapshots - the mutators and the setter must stay
 * consistent no matter how they interleave.
 */
describe('ContextmenuItemsState', () => {
	let menu: RootMenuState;

	const create_entry = () => new EntryState(menu, () => () => {});

	beforeEach(() => {
		menu = new RootMenuState();
	});

	test('add_item appends and publishes a new snapshot', () => {
		const before = menu.items;
		const entry = create_entry();

		menu.add_item(entry);

		assert.notStrictEqual(menu.items, before);
		assert.deepEqual([...menu.items], [entry]);
	});

	test('remove_item removes and publishes a new snapshot', () => {
		const entry_a = create_entry();
		const entry_b = create_entry();
		menu.add_item(entry_a);
		menu.add_item(entry_b);
		const before = menu.items;

		menu.remove_item(entry_a);

		assert.notStrictEqual(menu.items, before);
		assert.deepEqual([...menu.items], [entry_b]);
	});

	test('remove_item of an absent item preserves the snapshot reference', () => {
		menu.add_item(create_entry());
		const before = menu.items;

		menu.remove_item(create_entry());

		assert.strictEqual(menu.items, before);
	});

	test('assignment publishes a copy of the assigned array', () => {
		const entry = create_entry();
		const assigned = [entry];

		menu.items = assigned;

		assert.deepEqual([...menu.items], [entry]);
		// a copy, so mutating the caller's array can't mutate the published snapshot
		assert.notStrictEqual(menu.items, assigned);
		assigned.push(create_entry());
		assert.deepEqual([...menu.items], [entry]);
	});

	test('assignment then add_item composes', () => {
		const entry_a = create_entry();
		const entry_b = create_entry();
		menu.items = [entry_a];

		menu.add_item(entry_b);

		assert.deepEqual([...menu.items], [entry_a, entry_b]);
	});

	test('assignment then remove_item composes', () => {
		const entry_a = create_entry();
		const entry_b = create_entry();
		menu.items = [entry_a, entry_b];

		menu.remove_item(entry_a);

		assert.deepEqual([...menu.items], [entry_b]);
	});

	test('mutating the assigned array after assignment does not corrupt the source', () => {
		const entry_a = create_entry();
		const entry_b = create_entry();
		const assigned: Array<EntryState> = [entry_a];
		menu.items = assigned;

		// the setter copied the assigned array, so this mutation is invisible
		assigned.push(create_entry());
		menu.add_item(entry_b);

		assert.deepEqual([...menu.items], [entry_a, entry_b]);
	});
});
