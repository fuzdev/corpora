/**
 * @vitest-environment jsdom
 */
import { describe, test, assert, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import type { DeclarationJsonInput } from 'svelte-docinfo/types.js';

import { Declaration } from '#lib/declaration.svelte.ts';
import type { Module } from '#lib/module.svelte.ts';
import DeclarationDetailHarness from './DeclarationDetailHarness.svelte';
import { mount_component, unmount_component } from './test_helpers.ts';
import { fake_library } from './library_test_helpers.ts';

let mounted: { instance: any; container: HTMLElement } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount_component(mounted.instance, mounted.container);
		mounted = null;
	}
});

// `import_statement` reads the module's path and the library's package name;
// nothing else rendered here touches the module, and `ModuleLink` resolves
// against the fake library, finding nothing
const mount_detail = (json: Record<string, unknown>): HTMLElement => {
	const module = { path: 'A.svelte', library: { pkg_json: { name: 'pkg' } } };
	const declaration = new Declaration(
		module as unknown as Module,
		json as unknown as DeclarationJsonInput
	);
	mounted = mount_component(DeclarationDetailHarness as any, {
		declaration,
		library: fake_library()
	});
	flushSync();
	return mounted.container;
};

const find_css_section = (container: HTMLElement): HTMLElement => {
	const heading = Array.from(container.querySelectorAll('h4')).find(
		(h) => h.textContent === 'CSS custom properties'
	);
	assert.ok(heading, 'expected the CSS custom properties section');
	return heading.parentElement!;
};

describe('DeclarationDetail CSS custom properties', () => {
	test('an all-inferred list shows no chips and no legend', () => {
		const container = mount_detail({
			name: 'A',
			kind: 'component',
			cssCustomProperties: [
				{ name: '--a', fallback: 'red', sourceLine: 3 },
				{ name: '--b', fallback: '1px', sourceLine: 4 }
			]
		});
		const section = find_css_section(container);
		assert.strictEqual(section.querySelectorAll('.chip').length, 0);
		assert.strictEqual(section.querySelector('p'), null);
	});

	test('a mixed list marks the inferred entries and explains the chip', () => {
		const container = mount_detail({
			name: 'A',
			kind: 'component',
			cssCustomProperties: [
				{ name: '--a', syntax: '<color>', sourceLine: 2, documented: true },
				{ name: '--b', fallback: '1px', sourceLine: 4 }
			]
		});
		const section = find_css_section(container);
		const legend = section.querySelector(':scope > p');
		assert.ok(legend, 'expected the legend line');
		assert.include(legend.textContent, 'inferred');
		assert.include(legend.textContent, '@cssprop');
		const entries = Array.from(section.querySelectorAll(':scope > section'));
		assert.strictEqual(entries.length, 2);
		assert.strictEqual(entries[0]!.querySelectorAll('.chip').length, 0);
		assert.strictEqual(entries[1]!.querySelector('.chip')?.textContent, 'inferred');
		assert.strictEqual(section.querySelector('.chip[title]'), null);
	});

	test('an empty list renders no section', () => {
		const container = mount_detail({ name: 'A', kind: 'component', cssCustomProperties: [] });
		const headings = Array.from(container.querySelectorAll('h4')).map((h) => h.textContent);
		assert.notInclude(headings, 'CSS custom properties');
	});
});
