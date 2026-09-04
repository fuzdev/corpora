/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, beforeEach, afterEach, vi } from 'vitest';

import {
	ContextmenuState,
	contextmenu_attachment,
	contextmenu_open
} from '$lib/contextmenu_state.svelte.ts';

describe('contextmenu_open DOM querying', () => {
	let contextmenu: ContextmenuState;
	let root: HTMLElement;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		root = document.createElement('div');
		document.body.appendChild(root);
	});

	afterEach(() => {
		root.remove();
	});

	test('returns false without hanging for a stale dataset marker', () => {
		// Simulates a stale marker - the dataset attribute is present
		// (e.g. set by external code) but no params are registered for the element.
		const el = document.createElement('div');
		el.dataset.contextmenu = '';
		root.appendChild(el);
		const child = document.createElement('span');
		el.appendChild(child);

		assert.strictEqual(contextmenu_open(child, 0, 0, contextmenu), false);
		assert.strictEqual(contextmenu.opened, false);
	});

	test('collects entries from ancestors above a stale dataset marker', () => {
		const outer = document.createElement('div');
		root.appendChild(outer);
		const stale = document.createElement('div');
		stale.dataset.contextmenu = '';
		outer.appendChild(stale);
		const target = document.createElement('span');
		stale.appendChild(target);

		const params = [
			{ snippet: 'text' as const, props: { content: 'outer entry', icon: '🙂', run: () => {} } }
		];
		const cleanup = contextmenu_attachment(params)(outer);

		assert.strictEqual(contextmenu_open(target, 10, 20, contextmenu), true);
		assert.strictEqual(contextmenu.opened, true);
		assert.deepEqual(contextmenu.params, params);

		cleanup?.();
	});

	test('attachment params register and unregister', () => {
		const el = document.createElement('div');
		root.appendChild(el);

		const params = [
			{ snippet: 'text' as const, props: { content: 'entry', icon: '🙂', run: () => {} } }
		];
		const cleanup = contextmenu_attachment(params)(el);
		assert.strictEqual(el.dataset.contextmenu, '');

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		contextmenu.close();

		// Cleanup removes both the registration and the crawl marker,
		// so opening is a no-op instead of hanging or showing stale entries.
		cleanup?.();
		assert.strictEqual(el.dataset.contextmenu, undefined);
		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), false);
		assert.strictEqual(contextmenu.opened, false);
	});

	test('attachment accepts a single non-array params value', () => {
		const el = document.createElement('div');
		root.appendChild(el);

		const param = {
			snippet: 'text' as const,
			props: { content: 'entry', icon: '🙂', run: () => {} }
		};
		const cleanup = contextmenu_attachment(param)(el);

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		assert.deepEqual(contextmenu.params, [param]);

		cleanup?.();
	});

	test('collects nested params in bubbling order, mixing single and array registrations', () => {
		const outer = document.createElement('div');
		root.appendChild(outer);
		const inner = document.createElement('div');
		outer.appendChild(inner);

		const outer_param = {
			snippet: 'text' as const,
			props: { content: 'outer', icon: '🅾️', run: () => {} }
		};
		const inner_params = [
			{ snippet: 'text' as const, props: { content: 'inner a', icon: '🅰️', run: () => {} } },
			{ snippet: 'text' as const, props: { content: 'inner b', icon: '🅱️', run: () => {} } }
		];
		const cleanup_outer = contextmenu_attachment(outer_param)(outer);
		const cleanup_inner = contextmenu_attachment(inner_params)(inner);

		assert.strictEqual(contextmenu_open(inner, 0, 0, contextmenu), true);
		assert.deepEqual(contextmenu.params, [...inner_params, outer_param]);

		cleanup_outer?.();
		cleanup_inner?.();
	});
});

describe('contextmenu_open copy-text entry', () => {
	let contextmenu: ContextmenuState;
	let root: HTMLElement;

	const text_param = {
		snippet: 'text' as const,
		props: { content: 'entry', icon: '🙂', run: () => {} }
	};

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		root = document.createElement('div');
		document.body.appendChild(root);
	});

	afterEach(() => {
		root.remove();
		vi.restoreAllMocks();
	});

	const stub_selection = (text: string) => {
		vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => text } as Selection);
	};

	test('prepends a copy-text entry when text is selected and other entries exist', () => {
		const el = document.createElement('div');
		root.appendChild(el);
		const cleanup = contextmenu_attachment([text_param])(el);
		stub_selection('selected text');

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		assert.strictEqual(contextmenu.params.length, 2);
		const first = contextmenu.params[0]!;
		assert.ok(typeof first !== 'function' && first.snippet === 'text');
		assert.strictEqual(first.props.content, 'copy text');

		cleanup?.();
	});

	test('the copy-text entry writes the selection to the clipboard', async () => {
		const el = document.createElement('div');
		root.appendChild(el);
		const cleanup = contextmenu_attachment([text_param])(el);
		stub_selection('selected text');

		// jsdom has no `navigator.clipboard` - define a stub
		const writeText = vi.fn(() => Promise.resolve());
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		const first = contextmenu.params[0]!;
		assert.ok(typeof first !== 'function' && first.snippet === 'text');
		await first.props.run();
		assert.deepEqual(writeText.mock.calls, [['selected text']]);

		cleanup?.();
		delete (navigator as any).clipboard;
	});

	test('adds no copy-text entry when nothing is selected', () => {
		const el = document.createElement('div');
		root.appendChild(el);
		const cleanup = contextmenu_attachment([text_param])(el);
		stub_selection('');

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		assert.deepEqual(contextmenu.params, [text_param]);

		cleanup?.();
	});

	test('adds no copy-text entry without other entries', () => {
		const el = document.createElement('div');
		root.appendChild(el);
		stub_selection('selected text');

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), false);
		assert.strictEqual(contextmenu.opened, false);
	});

	test('text_enabled: false drops the copy-text entry', () => {
		const el = document.createElement('div');
		root.appendChild(el);
		const separator_param = { snippet: 'separator' as const, props: {} };
		const cleanup = contextmenu_attachment([separator_param])(el);
		stub_selection('selected text');

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu, { text_enabled: false }), true);
		assert.deepEqual(contextmenu.params, [separator_param]);

		cleanup?.();
	});
});

describe('contextmenu_open vibrate', () => {
	let contextmenu: ContextmenuState;
	let root: HTMLElement;
	let el: HTMLElement;
	let cleanup: (() => void) | undefined | void;
	let vibrate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		root = document.createElement('div');
		document.body.appendChild(root);
		el = document.createElement('div');
		root.appendChild(el);
		cleanup = contextmenu_attachment([
			{ snippet: 'text' as const, props: { content: 'entry', icon: '🙂', run: () => {} } }
		])(el);
		// jsdom has no `navigator.vibrate` - define a stub
		vibrate = vi.fn(() => true);
		Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
	});

	afterEach(() => {
		cleanup?.();
		root.remove();
		delete (navigator as any).vibrate;
	});

	test('vibrates on open by default', () => {
		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		assert.strictEqual(vibrate.mock.calls.length, 1);
	});

	test('vibrate: false disables haptic feedback', () => {
		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu, { vibrate: false }), true);
		assert.strictEqual(vibrate.mock.calls.length, 0);
	});

	test('does not vibrate when the open is a no-op', () => {
		const bare = document.createElement('div');
		root.appendChild(bare);
		assert.strictEqual(contextmenu_open(bare, 0, 0, contextmenu), false);
		assert.strictEqual(vibrate.mock.calls.length, 0);
	});
});

describe('contextmenu_open entry filtering', () => {
	let contextmenu: ContextmenuState;
	let root: HTMLElement;

	const text_param = {
		snippet: 'text' as const,
		props: { content: 'entry', icon: '🙂', run: () => {} }
	};
	const separator_param = { snippet: 'separator' as const, props: {} };

	beforeEach(() => {
		contextmenu = new ContextmenuState();
		root = document.createElement('div');
		document.body.appendChild(root);
	});

	afterEach(() => {
		root.remove();
	});

	test('separator_enabled: false drops separator params', () => {
		const el = document.createElement('div');
		root.appendChild(el);
		const cleanup = contextmenu_attachment([text_param, separator_param])(el);

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu, { separator_enabled: false }), true);
		assert.deepEqual(contextmenu.params, [text_param]);

		cleanup?.();
	});

	test('link_enabled: false drops the anchor-derived link param', () => {
		const anchor = document.createElement('a');
		anchor.href = '/somewhere';
		root.appendChild(anchor);
		const el = document.createElement('span');
		anchor.appendChild(el);
		const cleanup = contextmenu_attachment([text_param])(el);

		// sanity: with links enabled the anchor contributes a link param
		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu), true);
		assert.strictEqual(contextmenu.params.length, 2);
		contextmenu.close();

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu, { link_enabled: false }), true);
		assert.deepEqual(contextmenu.params, [text_param]);

		cleanup?.();
	});

	test('returns false when filtering removes every param', () => {
		const el = document.createElement('div');
		root.appendChild(el);
		const cleanup = contextmenu_attachment([text_param])(el);

		assert.strictEqual(contextmenu_open(el, 0, 0, contextmenu, { text_enabled: false }), false);
		assert.strictEqual(contextmenu.opened, false);

		cleanup?.();
	});
});
