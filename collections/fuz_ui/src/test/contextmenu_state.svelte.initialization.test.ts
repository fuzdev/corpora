import { describe, test, assert, beforeEach } from 'vitest';

import { ContextmenuState } from '$lib/contextmenu_state.svelte.ts';

describe('ContextmenuState - Initialization', () => {
	let contextmenu: ContextmenuState;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
	});

	describe('initialization', () => {
		test('creates with default state', () => {
			assert.strictEqual(contextmenu.opened, false);
			assert.strictEqual(contextmenu.x, 0);
			assert.strictEqual(contextmenu.y, 0);
			assert.deepEqual(contextmenu.params, []);
			assert.strictEqual(contextmenu.error, undefined);
			assert.deepEqual(contextmenu.selections, []);
		});

		test('creates layout when no initial layout provided', () => {
			assert.ok(contextmenu.layout);
			assert.strictEqual(contextmenu.has_custom_layout, false);
		});

		test('uses provided initial layout', () => {
			const custom_layout = { width: 800, height: 600 };
			const cm = new ContextmenuState({ layout: custom_layout });
			assert.strictEqual(cm.layout, custom_layout);
			assert.strictEqual(cm.has_custom_layout, true);
		});

		test('has root_menu initialized', () => {
			assert.ok(contextmenu.root_menu);
			assert.strictEqual(contextmenu.root_menu.is_menu, true);
			assert.strictEqual(contextmenu.root_menu.menu, null);
			assert.strictEqual(contextmenu.root_menu.depth, 1);
			assert.deepEqual(contextmenu.root_menu.items, []);
		});

		test('custom layout is preserved', () => {
			const custom_layout = { width: 1920, height: 1080 };
			const cm = new ContextmenuState({ layout: custom_layout });

			// Open and close shouldn't modify custom layout
			cm.open([], 100, 200);
			cm.close();

			assert.strictEqual(cm.layout, custom_layout);
			assert.strictEqual(cm.layout.width, 1920);
			assert.strictEqual(cm.layout.height, 1080);
		});

		test('default layout dimensions are reasonable', () => {
			// Layout exists even if dimensions are initially 0
			assert.ok(contextmenu.layout);
			assert.typeOf(contextmenu.layout.width, 'number');
			assert.typeOf(contextmenu.layout.height, 'number');

			// Dimensions are not negative or NaN
			assert.isFalse(Number.isNaN(contextmenu.layout.width));
			assert.isFalse(Number.isNaN(contextmenu.layout.height));
			assert.isAtLeast(contextmenu.layout.width, 0);
			assert.isAtLeast(contextmenu.layout.height, 0);
		});
	});
});
