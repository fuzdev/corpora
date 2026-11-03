import { test, assert, describe } from 'vitest';
import type { ModuleJsonInput } from 'svelte-docinfo/types.js';

import { Module } from '#lib/module.svelte.ts';
import type { Library } from '#lib/library.svelte.ts';

// The fields under test read only `module_json`, so a bare library stub suffices.
const create_module = (json: Partial<ModuleJsonInput>): Module =>
	new Module({} as unknown as Library, { path: 'a.ts', ...json });

describe('module doc fields', () => {
	test('compacted wire data (stripped defaults) reads as empty', () => {
		const module = create_module({});
		assert.strictEqual(module.module_comment, undefined);
		assert.deepEqual(module.examples, []);
		assert.deepEqual(module.see_also, []);
		assert.strictEqual(module.since, undefined);
		assert.strictEqual(module.is_deprecated, false);
		assert.strictEqual(module.is_internal, false);
		assert.strictEqual(module.has_module_doc, false);
	});

	test('reads each field', () => {
		const module = create_module({
			moduleComment: 'prose',
			examples: ['```ts\na();\n```'],
			seeAlso: ['`b.ts`'],
			since: '1.2.0',
			deprecatedMessage: 'use `b.ts`',
			internalMessage: 'unstable'
		});
		assert.strictEqual(module.module_comment, 'prose');
		assert.deepEqual(module.examples, ['```ts\na();\n```']);
		assert.deepEqual(module.see_also, ['`b.ts`']);
		assert.strictEqual(module.since, '1.2.0');
		assert.strictEqual(module.deprecated_message, 'use `b.ts`');
		assert.strictEqual(module.internal_message, 'unstable');
		assert.strictEqual(module.has_module_doc, true);
	});

	test('a bare `@deprecated` or `@internal` (empty message) still marks the module', () => {
		const module = create_module({ deprecatedMessage: '', internalMessage: '' });
		assert.strictEqual(module.is_deprecated, true);
		assert.strictEqual(module.is_internal, true);
		assert.strictEqual(module.has_module_doc, true);
	});

	test('a tag-only module comment has no prose but still has doc', () => {
		const module = create_module({ seeAlso: ['{@link https://example.com}'] });
		assert.strictEqual(module.module_comment, undefined);
		assert.strictEqual(module.has_module_doc, true);
	});
});
