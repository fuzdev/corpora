/**
 * Shared factories for constructing contextmenu state items in tests.
 *
 * These construct AND register items in one step. Registering matters:
 * an `EntryState` constructed without being added to `menu.items` silently
 * bypasses `reset_items` on close, which can mask real bugs in tests that
 * assert on close/reset behavior. Use these helpers unless a test
 * deliberately needs an orphaned (unregistered) item.
 */

import {
	EntryState,
	SubmenuState,
	type ContextmenuRun,
	type RootMenuState
} from '$lib/contextmenu_state.svelte.ts';

/**
 * Creates an `EntryState` and registers it via `menu.add_item`.
 *
 * Note that `EntryState`'s second constructor arg is a getter returning
 * the run function, so this wraps `run` in a getter for callers.
 *
 * @param menu - the menu to register the entry in
 * @param run - the entry's run function (wrapped in a getter internally)
 * @param disabled - optional disabled getter, defaults to enabled
 * @returns the registered entry
 */
export const add_test_entry = (
	menu: SubmenuState | RootMenuState,
	run: ContextmenuRun = () => {},
	disabled?: () => boolean
): EntryState => {
	const entry = new EntryState(menu, () => run, disabled);
	menu.add_item(entry);
	return entry;
};

/**
 * Creates a `SubmenuState` at `menu.depth + 1` and registers it via `menu.add_item`.
 *
 * @param menu - the menu to register the submenu in
 * @returns the registered submenu
 */
export const add_test_submenu = (menu: SubmenuState | RootMenuState): SubmenuState => {
	const submenu = new SubmenuState(menu, menu.depth + 1);
	menu.add_item(submenu);
	return submenu;
};
