/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import type { TypeJson } from 'svelte-docinfo/types.js';

import type { Library } from '$lib/library.svelte.ts';
import TypeJsonViewHarness from './TypeJsonViewHarness.svelte';
import { mount_component, unmount_component } from './test_helpers.ts';
import { fake_library } from './library_test_helpers.ts';

let mounted: { instance: any; container: HTMLElement } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount_component(mounted.instance, mounted.container);
		mounted = null;
	}
});

const mount_view = (
	type_info: TypeJson,
	library: Library = fake_library(),
	title?: string
): HTMLElement => {
	mounted = mount_component(TypeJsonViewHarness as any, { type_info, library, title });
	flushSync();
	return mounted.container;
};

describe('TypeJsonView', () => {
	// textContent assertions lock whitespace-exact rendering — stray template
	// whitespace between tokens would surface here as doubled spaces

	test('renders a generic instantiation without stray whitespace', () => {
		const container = mount_view({
			kind: 'reference',
			name: 'Map',
			typeArgs: [
				{ kind: 'intrinsic', text: 'string' },
				{ kind: 'reference', name: 'A' }
			]
		});
		assert.strictEqual(container.textContent, 'Map<string, A>');
		assert.ok(container.querySelector('code.type-json-view'), 'expected the code wrapper');
	});

	test('renders a union with parenthesized function member', () => {
		const container = mount_view({
			kind: 'union',
			members: [
				{ kind: 'function', text: '(x: string) => void' },
				{ kind: 'intrinsic', text: 'null' }
			]
		});
		assert.strictEqual(container.textContent, '((x: string) => void) | null');
	});

	test('a bare unresolvable reference renders as inline code without the wrapper', () => {
		const container = mount_view({ kind: 'reference', name: 'A' });
		assert.strictEqual(container.textContent, 'A');
		assert.strictEqual(container.querySelector('code.type-json-view'), null);
	});

	test('a terminal root renders as highlighted code inside the wrapper', () => {
		// e.g. a conditional type alias reprinted at its own declaration root
		const container = mount_view({ kind: 'other', text: 'T extends string ? A : B' });
		assert.strictEqual(container.textContent, 'T extends string ? A : B');
		assert.ok(container.querySelector('code.type-json-view'), 'expected the code wrapper');
	});

	test('a bare resolvable reference renders as a declaration link', () => {
		const container = mount_view({ kind: 'reference', name: 'A' }, fake_library(['A']));
		const link = container.querySelector('a');
		assert.ok(link, 'expected a link');
		assert.strictEqual(link.textContent, 'A');
		assert.strictEqual(link.getAttribute('href'), '/docs/api/x.ts#A');
	});

	test('resolvable names link inside composite trees', () => {
		const container = mount_view(
			{
				kind: 'union',
				members: [
					{ kind: 'reference', name: 'A' },
					{ kind: 'intrinsic', text: 'null' }
				]
			},
			fake_library(['A'])
		);
		assert.strictEqual(container.textContent, 'A | null');
		const link = container.querySelector('code.type-json-view a');
		assert.ok(link, 'expected a link inside the wrapper');
		assert.strictEqual(link.textContent, 'A');
	});

	test('a moduled reference resolves scoped to its declaring module', () => {
		const container = mount_view(
			{ kind: 'reference', name: 'A', module: 'y.ts' },
			fake_library([], { 'y.ts': ['A'] })
		);
		const link = container.querySelector('a');
		assert.ok(link, 'expected a link');
		assert.strictEqual(link.getAttribute('href'), '/docs/api/y.ts#A');
	});

	test('a moduled reference missing from its module renders as code, no by-name fallback', () => {
		const container = mount_view(
			{ kind: 'reference', name: 'A', module: 'y.ts' },
			fake_library(['A'], { 'y.ts': [] })
		);
		assert.strictEqual(container.querySelector('a'), null);
		assert.strictEqual(container.textContent, 'A');
	});

	test('moduled references link inside composite trees', () => {
		const container = mount_view(
			{
				kind: 'union',
				members: [
					{ kind: 'reference', name: 'A', module: 'y.ts' },
					{ kind: 'intrinsic', text: 'null' }
				]
			},
			fake_library([], { 'y.ts': ['A'] })
		);
		assert.strictEqual(container.textContent, 'A | null');
		const link = container.querySelector('code.type-json-view a');
		assert.ok(link, 'expected a link inside the wrapper');
		assert.strictEqual(link.getAttribute('href'), '/docs/api/y.ts#A');
	});

	test('title lands on the wrapper of a composite tree', () => {
		const container = mount_view(
			{
				kind: 'union',
				members: [
					{ kind: 'reference', name: 'A' },
					{ kind: 'intrinsic', text: 'null' }
				]
			},
			fake_library(),
			'A | null'
		);
		assert.strictEqual(
			container.querySelector('code.type-json-view')?.getAttribute('title'),
			'A | null'
		);
	});

	test('title lands on the root element of a bare name', () => {
		const container = mount_view(
			{ kind: 'reference', name: 'A' },
			fake_library(['A']),
			'expansion'
		);
		assert.strictEqual(container.querySelector('a')?.getAttribute('title'), 'expansion');
	});

	test('an alias-carrying union links its alias instead of expanding', () => {
		const container = mount_view(
			{
				kind: 'union',
				alias: 'E',
				members: [
					{ kind: 'literal', value: 'a', text: '"a"' },
					{ kind: 'literal', value: 'b', text: '"b"' }
				]
			},
			fake_library(['E'])
		);
		assert.strictEqual(container.textContent, 'E');
		assert.ok(container.querySelector('a'), 'expected a link');
	});
});
