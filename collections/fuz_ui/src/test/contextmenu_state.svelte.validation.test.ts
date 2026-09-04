import { describe, test, assert, beforeEach } from 'vitest';

import { ContextmenuState } from '$lib/contextmenu_state.svelte.ts';
import { add_test_entry, add_test_submenu } from './contextmenu_state_test_helpers.ts';

describe('ContextmenuState - Validation', () => {
	let contextmenu: ContextmenuState;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
	});

	describe('derived validation properties', () => {
		describe('can_collapse', () => {
			test('returns false with no selection', () => {
				assert.strictEqual(contextmenu.can_collapse, false);
			});

			test('returns false with single selection at root level', () => {
				const entry = add_test_entry(contextmenu.root_menu);
				contextmenu.select(entry);

				assert.strictEqual(contextmenu.can_collapse, false);
			});

			test('returns true with nested selection', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				add_test_entry(submenu);

				contextmenu.select(submenu);
				contextmenu.expand_selected();

				assert.strictEqual(contextmenu.can_collapse, true);
			});

			test('returns false after collapsing to root level', () => {
				$effect.root(() => {
					const submenu = add_test_submenu(contextmenu.root_menu);
					add_test_entry(submenu);

					contextmenu.select(submenu);
					contextmenu.expand_selected();
					contextmenu.collapse_selected();

					assert.strictEqual(contextmenu.can_collapse, false);
				});
			});

			test('multi-level collapse validation', () => {
				$effect.root(() => {
					const submenu1 = add_test_submenu(contextmenu.root_menu);
					const submenu2 = add_test_submenu(submenu1);
					add_test_entry(submenu2);

					// Navigate to depth 3
					contextmenu.select(submenu1);
					contextmenu.expand_selected();
					contextmenu.expand_selected();

					// Can collapse from depth 3
					assert.strictEqual(contextmenu.can_collapse, true);

					// Collapse to depth 2
					contextmenu.collapse_selected();
					assert.strictEqual(contextmenu.can_collapse, true);

					// Collapse to depth 1 (root)
					contextmenu.collapse_selected();
					assert.strictEqual(contextmenu.can_collapse, false);
				});
			});
		});

		describe('can_expand', () => {
			test('returns false with no selection', () => {
				assert.strictEqual(contextmenu.can_expand, false);
			});

			test('returns false when entry is selected', () => {
				const entry = add_test_entry(contextmenu.root_menu);
				contextmenu.select(entry);

				assert.strictEqual(contextmenu.can_expand, false);
			});

			test('returns true when submenu with items is selected', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				add_test_entry(submenu);
				contextmenu.select(submenu);

				assert.strictEqual(contextmenu.can_expand, true);
			});

			test('returns false when empty submenu is selected', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				contextmenu.select(submenu);

				assert.strictEqual(contextmenu.can_expand, false);
			});

			test('returns false after expanding into submenu', () => {
				$effect.root(() => {
					const submenu = add_test_submenu(contextmenu.root_menu);
					add_test_entry(submenu);

					contextmenu.select(submenu);
					contextmenu.expand_selected();

					// Now entry is selected, which is not a menu
					assert.strictEqual(contextmenu.can_expand, false);
				});
			});

			test('deep submenu expansion validation', () => {
				$effect.root(() => {
					const submenu1 = add_test_submenu(contextmenu.root_menu);
					const submenu2 = add_test_submenu(submenu1);
					const submenu3 = add_test_submenu(submenu2);
					add_test_entry(submenu3);

					// At each level, can_expand should be true when submenu is selected
					contextmenu.select(submenu1);
					assert.strictEqual(contextmenu.can_expand, true);

					contextmenu.expand_selected();
					assert.strictEqual(contextmenu.can_expand, true);

					contextmenu.expand_selected();
					assert.strictEqual(contextmenu.can_expand, true);

					contextmenu.expand_selected();
					// Now entry is selected (not a submenu)
					assert.strictEqual(contextmenu.can_expand, false);
				});
			});
		});

		describe('can_select_sibling', () => {
			test('returns false with empty menu', () => {
				assert.strictEqual(contextmenu.can_select_sibling, false);
			});

			test('returns false with single item', () => {
				add_test_entry(contextmenu.root_menu);

				assert.strictEqual(contextmenu.can_select_sibling, false);
			});

			test('returns true with multiple items', () => {
				add_test_entry(contextmenu.root_menu);
				add_test_entry(contextmenu.root_menu);

				assert.strictEqual(contextmenu.can_select_sibling, true);
			});

			test('returns true with multiple items and selection', () => {
				const entry1 = add_test_entry(contextmenu.root_menu);
				const entry2 = add_test_entry(contextmenu.root_menu);

				contextmenu.select(entry1);
				assert.strictEqual(contextmenu.can_select_sibling, true);

				contextmenu.select(entry2);
				assert.strictEqual(contextmenu.can_select_sibling, true);
			});

			test('checks current menu level when in submenu', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				add_test_entry(submenu);

				contextmenu.select(submenu);
				contextmenu.expand_selected();

				// Only one item in submenu
				assert.strictEqual(contextmenu.can_select_sibling, false);
			});

			test('returns true in submenu with multiple items', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				add_test_entry(submenu);
				add_test_entry(submenu);

				contextmenu.select(submenu);
				contextmenu.expand_selected();

				assert.strictEqual(contextmenu.can_select_sibling, true);
			});
		});

		describe('can_activate', () => {
			test('returns false with no selection', () => {
				assert.strictEqual(contextmenu.can_activate, false);
			});

			test('returns true with enabled entry selected', () => {
				const entry = add_test_entry(contextmenu.root_menu);
				contextmenu.select(entry);

				assert.strictEqual(contextmenu.can_activate, true);
			});

			test('returns false with disabled entry selected', () => {
				const entry = add_test_entry(
					contextmenu.root_menu,
					() => {},
					() => true
				);
				contextmenu.select(entry);

				assert.strictEqual(contextmenu.can_activate, false);
			});

			test('returns true when submenu with items is selected', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				add_test_entry(submenu);
				contextmenu.select(submenu);

				assert.strictEqual(contextmenu.can_activate, true);
			});

			test('returns false when empty submenu is selected', () => {
				const submenu = add_test_submenu(contextmenu.root_menu);
				contextmenu.select(submenu);

				assert.strictEqual(contextmenu.can_activate, false);
			});

			test('returns true for entry with async action', () => {
				const entry = add_test_entry(contextmenu.root_menu, async () => {});
				contextmenu.select(entry);

				assert.strictEqual(contextmenu.can_activate, true);
			});

			test('evaluates disabled function for entries', () => {
				let counter = 0;
				const entry = add_test_entry(
					contextmenu.root_menu,
					() => {},
					() => {
						counter++;
						return false;
					}
				);
				contextmenu.select(entry);

				// Access the property to trigger evaluation
				const result = contextmenu.can_activate;
				assert.strictEqual(result, true);
				// Verify the disabled function was called
				assert.strictEqual(counter, 1);
			});

			test('dynamic disabled state changes', () => {
				$effect.root(() => {
					let is_disabled = $state(false);
					const entry = add_test_entry(
						contextmenu.root_menu,
						() => {},
						() => is_disabled
					);
					contextmenu.select(entry);

					// Initially enabled
					assert.strictEqual(contextmenu.can_activate, true);

					// Dynamically disable
					is_disabled = true;
					assert.strictEqual(contextmenu.can_activate, false);

					// Re-enable
					is_disabled = false;
					assert.strictEqual(contextmenu.can_activate, true);
				});
			});
		});
	});
});
