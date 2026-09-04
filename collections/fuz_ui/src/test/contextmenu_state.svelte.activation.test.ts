import { describe, test, assert, beforeEach } from 'vitest';

import { ContextmenuState, EntryState, SubmenuState } from '$lib/contextmenu_state.svelte.ts';
import { add_test_entry, add_test_submenu } from './contextmenu_state_test_helpers.ts';

describe('ContextmenuState - Activation', () => {
	let contextmenu: ContextmenuState;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
	});

	describe('activation', () => {
		test('activate() runs synchronous callback and closes', () => {
			let ran = false;
			const entry = new EntryState(contextmenu.root_menu, () => () => {
				ran = true;
			});

			contextmenu.open([], 0, 0);
			void contextmenu.activate(entry);

			assert.strictEqual(ran, true);
			assert.strictEqual(contextmenu.opened, false);
		});

		test('activate() handles synchronous error and stays open', () => {
			const entry = add_test_entry(contextmenu.root_menu, () => {
				throw new Error('test error');
			});

			contextmenu.open([], 0, 0);
			const returned = contextmenu.activate(entry);

			assert.strictEqual(returned, false);
			assert.strictEqual(entry.error_message, 'test error');
			assert.strictEqual(contextmenu.error, 'test error');
			// Matches the async failure path - the menu stays open to display the error.
			assert.strictEqual(contextmenu.opened, true);
		});

		test('activate() returns false for a synchronous failed result and stays open', () => {
			const entry = add_test_entry(contextmenu.root_menu, () => ({
				ok: false as const,
				message: 'sync failure'
			}));

			contextmenu.open([], 0, 0);
			const returned = contextmenu.activate(entry);

			// A failed result reports the same as a synchronous throw.
			assert.strictEqual(returned, false);
			assert.strictEqual(entry.error_message, 'sync failure');
			assert.strictEqual(contextmenu.error, 'sync failure');
			assert.strictEqual(contextmenu.opened, true);
		});

		test('activate() handles async success and closes', async () => {
			let resolved = false;
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				resolved = true;
				return { ok: true };
			});

			contextmenu.open([], 0, 0);
			const promise = contextmenu.activate(entry);

			assert.strictEqual(entry.pending, true);
			assert.strictEqual(entry.error_message, null);

			await promise;

			assert.strictEqual(resolved, true);
			assert.strictEqual(entry.pending, false);
			assert.strictEqual(contextmenu.opened, false);
		});

		test('activate() handles async error', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				throw new Error('async error');
			});

			const promise = contextmenu.activate(entry);
			await promise;

			assert.strictEqual(entry.error_message, 'async error');
			assert.strictEqual(contextmenu.error, 'async error');
			assert.strictEqual(entry.pending, false);
		});

		test('activate() handles async failure result', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				return { ok: false, message: 'failed' };
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			assert.strictEqual(entry.error_message, 'failed');
			assert.strictEqual(contextmenu.error, 'failed');
			assert.strictEqual(contextmenu.opened, true); // Should not close on failure
		});

		test('activate() on submenu calls expand_selected', () => {
			const submenu = new SubmenuState(contextmenu.root_menu, 2);
			const child = add_test_entry(submenu);

			contextmenu.select(submenu);
			void contextmenu.activate(submenu);

			assert.strictEqual(child.selected, true);
		});

		test('activate() on an unselected submenu selects it and expands into its first child', () => {
			const submenu = add_test_submenu(contextmenu.root_menu);
			const child = add_test_entry(submenu);
			const other = add_test_entry(contextmenu.root_menu);
			contextmenu.select(other); // the submenu is not the selection tail

			const result = contextmenu.activate(submenu);

			assert.strictEqual(result, true);
			assert.deepEqual(contextmenu.selections, [submenu, child]);
			assert.strictEqual(submenu.selected, true);
			assert.strictEqual(child.selected, true);
			assert.strictEqual(other.selected, false);
		});

		test('activate_selected() activates current selection', () => {
			let ran = false;
			const entry = add_test_entry(contextmenu.root_menu, () => {
				ran = true;
			});

			contextmenu.open([], 0, 0);
			contextmenu.select(entry);
			void contextmenu.activate_selected();

			assert.strictEqual(ran, true);
		});

		test('activate_selected() returns false without running when the selected entry was removed', () => {
			let ran = false;
			const entry = add_test_entry(contextmenu.root_menu, () => {
				ran = true;
			});

			contextmenu.open([], 0, 0);
			contextmenu.select(entry);
			contextmenu.root_menu.remove_item(entry);

			assert.strictEqual(contextmenu.can_activate, false);
			assert.strictEqual(contextmenu.activate_selected(), false);
			assert.strictEqual(ran, false);
		});

		test('activate_selected() selects first when no selection', () => {
			const entry = add_test_entry(contextmenu.root_menu);

			void contextmenu.activate_selected();

			assert.strictEqual(entry.selected, true);
		});

		test('activate() closes on void return (async)', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				// Implicit undefined/void return
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, false);
		});

		test('activate() ignores stale promise', async () => {
			let resolve1: any;
			let resolve2: any;
			const promise1: Promise<{ ok: true }> = new Promise((r) => (resolve1 = r));
			const promise2: Promise<{ ok: true }> = new Promise((r) => (resolve2 = r));

			let call_count = 0;
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				call_count++;
				return call_count === 1 ? await promise1 : await promise2;
			});

			contextmenu.open([], 0, 0);

			// First activation
			void contextmenu.activate(entry);
			assert.strictEqual(entry.pending, true);

			// Second activation (should replace first promise)
			const activation2 = contextmenu.activate(entry);

			// Resolve first promise (should be ignored)
			resolve1({ ok: true });
			await promise1;

			assert.strictEqual(contextmenu.opened, true); // Should still be open

			// Resolve second promise (should close)
			resolve2({ ok: true });
			await activation2;

			assert.strictEqual(contextmenu.opened, false);
		});

		test('activate() with close: false keeps menu open (async)', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				return { ok: true, close: false };
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, true); // Should stay open
		});

		test('activate() with close: true explicitly closes menu (async)', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				return { ok: true, close: true };
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, false); // Should close
		});

		test('activate() with {ok: true} defaults to closing (async)', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				return { ok: true };
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, false); // Should close by default
		});

		test('activate() with close: false keeps menu open (sync)', () => {
			const entry = new EntryState(contextmenu.root_menu, () => () => {
				return { ok: true, close: false };
			});

			contextmenu.open([], 0, 0);
			void contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, true); // Should stay open
		});

		test('activate() with {ok: true} defaults to closing (sync)', () => {
			const entry = new EntryState(contextmenu.root_menu, () => () => {
				return { ok: true };
			});

			contextmenu.open([], 0, 0);
			void contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, false); // Should close by default
		});

		test('activate() with {ok: false} never closes', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				return { ok: false, message: 'error' };
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			assert.strictEqual(contextmenu.opened, true); // Should not close on error
			assert.strictEqual(entry.error_message, 'error');
		});

		test('multiple concurrent activations handle correctly', async () => {
			let activation1_started = false;
			let activation2_started = false;
			let resolve1: any;
			let resolve2: any;

			const entry1 = add_test_entry(contextmenu.root_menu, async () => {
				activation1_started = true;
				await new Promise((r) => (resolve1 = r));
				return { ok: true };
			});

			const entry2 = add_test_entry(contextmenu.root_menu, async () => {
				activation2_started = true;
				await new Promise((r) => (resolve2 = r));
				return { ok: true };
			});

			contextmenu.open([], 0, 0);

			// Start both activations
			const promise1 = contextmenu.activate(entry1);
			const promise2 = contextmenu.activate(entry2);

			assert.strictEqual(activation1_started, true);
			assert.strictEqual(activation2_started, true);

			// Resolve in order
			resolve1({ ok: true });
			await promise1;

			resolve2({ ok: true });
			await promise2;

			// Both should complete successfully
			assert.strictEqual(entry1.pending, false);
			assert.strictEqual(entry2.pending, false);
		});

		test('activation during menu close is handled gracefully', async () => {
			let resolve: any;
			const promise = new Promise((r) => (resolve = r));

			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				await promise;
				return { ok: true };
			});

			contextmenu.open([], 0, 0);
			const activation = contextmenu.activate(entry);

			// Close menu while activation is pending
			contextmenu.close();
			assert.strictEqual(contextmenu.opened, false);

			// Resolve activation
			resolve({ ok: true });
			await activation;

			// Menu should stay closed
			assert.strictEqual(contextmenu.opened, false);
			assert.strictEqual(entry.pending, false);
		});

		test("activation error doesn't corrupt state", async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				throw new Error('corruption test');
			});

			contextmenu.open([], 0, 0);
			await contextmenu.activate(entry);

			// Error set correctly
			assert.strictEqual(entry.error_message, 'corruption test');
			assert.strictEqual(contextmenu.error, 'corruption test');

			// State remains consistent
			assert.strictEqual(entry.pending, false);
			assert.strictEqual(entry.promise, null);

			// Menu stays open on error
			assert.strictEqual(contextmenu.opened, true);

			// Can activate again successfully
			const entry2 = add_test_entry(contextmenu.root_menu, () => {
				return { ok: true };
			});

			void contextmenu.activate(entry2);
			assert.strictEqual(contextmenu.opened, false);
		});

		test('promise cancellation on close works', async () => {
			let resolve: any;
			const promise = new Promise((r) => (resolve = r));
			let completed = false;

			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				await promise;
				completed = true;
				return { ok: true };
			});

			contextmenu.open([], 0, 0);
			const activation = contextmenu.activate(entry);

			assert.strictEqual(entry.pending, true);

			// Close while pending - note: close() may not immediately clear pending
			// if the promise is still active
			contextmenu.close();
			// The menu is closed but promise may still be pending
			assert.strictEqual(contextmenu.opened, false);

			// Resolve promise
			resolve({ ok: true });
			await activation;

			// Activation completed, pending cleared
			assert.strictEqual(completed, true);
			assert.strictEqual(contextmenu.opened, false);
			assert.strictEqual(entry.pending, false);
		});

		test('activate() returns false for disabled entries and does not run callback', () => {
			let ran = false;
			const disabled_entry = add_test_entry(
				contextmenu.root_menu,
				() => {
					ran = true;
					return { ok: true };
				},
				() => true // disabled function returns true
			);

			contextmenu.open([], 0, 0);
			contextmenu.select(disabled_entry);

			// can_activate should return false for disabled entries
			assert.strictEqual(contextmenu.can_activate, false);

			// activate() itself enforces the disabled check
			const result = contextmenu.activate(disabled_entry);
			assert.strictEqual(result, false);
			assert.strictEqual(ran, false);
			assert.strictEqual(contextmenu.opened, true); // menu stays open
		});

		test('activate() uses "unknown error" fallback for non-Error sync throws', () => {
			const entry = new EntryState(contextmenu.root_menu, () => () => {
				throw 'not an Error object'; // eslint-disable-line @typescript-eslint/only-throw-error
			});

			void contextmenu.activate(entry);

			assert.strictEqual(entry.error_message, 'unknown error');
			assert.strictEqual(contextmenu.error, undefined);
		});

		test('activate() uses "unknown error" fallback for async rejection with non-Error', async () => {
			const entry = new EntryState(contextmenu.root_menu, () => async () => {
				throw 42; // eslint-disable-line @typescript-eslint/only-throw-error
			});

			await contextmenu.activate(entry);

			assert.strictEqual(entry.error_message, 'unknown error');
			assert.strictEqual(contextmenu.error, undefined);
			assert.strictEqual(entry.pending, false);
		});

		test('activate() uses "unknown error" for sync {ok: false} without message', () => {
			const entry = new EntryState(contextmenu.root_menu, () => () => {
				return { ok: false };
			});

			contextmenu.open([], 0, 0);
			void contextmenu.activate(entry);

			assert.strictEqual(entry.error_message, 'unknown error');
			assert.strictEqual(contextmenu.error, undefined);
			assert.strictEqual(contextmenu.opened, true);
		});
	});
});
