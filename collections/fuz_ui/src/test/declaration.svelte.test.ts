import { test, assert, describe } from 'vitest';
import type { DeclarationJsonInput, TypeJson } from 'svelte-docinfo/types.js';
import { typeJsonToText } from 'svelte-docinfo/declaration-helpers.js';

import { Declaration } from '$lib/declaration.svelte.ts';
import type { Module } from '$lib/module.svelte.ts';

// The fields under test read only `declaration_json` and `name`, so a bare
// module stub suffices; the loose input cast mirrors the runtime's untyped
// kind-specific field access.
const create_declaration = (json: Record<string, unknown>): Declaration =>
	new Declaration({} as unknown as Module, json as unknown as DeclarationJsonInput);

describe('type_info_expanded', () => {
	test('strips the self-alias from a union root so the members expand', () => {
		const type_info: TypeJson = {
			kind: 'union',
			alias: 'E',
			members: [
				{ kind: 'literal', value: 'a', text: '"a"' },
				{ kind: 'literal', value: 'b', text: '"b"' }
			]
		};
		const declaration = create_declaration({ name: 'E', kind: 'type', typeInfo: type_info });
		const expanded = declaration.type_info_expanded;
		assert.ok(expanded);
		assert(expanded.kind === 'union');
		assert.strictEqual(expanded.alias, undefined);
		assert.strictEqual(expanded.members, type_info.members);
		// the strip is what makes the members render instead of the circular name
		assert.strictEqual(typeJsonToText(expanded), '"a" | "b"');
		assert.strictEqual(typeJsonToText(type_info), 'E');
	});

	test('strips the self-alias from an intersection root', () => {
		const type_info: TypeJson = {
			kind: 'intersection',
			alias: 'Branded',
			members: [
				{ kind: 'intrinsic', text: 'string' },
				{ kind: 'reference', name: 'Brand' }
			]
		};
		const declaration = create_declaration({ name: 'Branded', kind: 'type', typeInfo: type_info });
		const expanded = declaration.type_info_expanded;
		assert.ok(expanded);
		assert(expanded.kind === 'intersection');
		assert.strictEqual(expanded.alias, undefined);
	});

	test('does not mutate the underlying tree', () => {
		const type_info: TypeJson = {
			kind: 'union',
			alias: 'E',
			members: [{ kind: 'intrinsic', text: 'null' }]
		};
		const declaration = create_declaration({ name: 'E', kind: 'type', typeInfo: type_info });
		declaration.type_info_expanded;
		assert.strictEqual(type_info.alias, 'E');
	});

	test('a union aliased to a different name passes through unchanged', () => {
		const type_info: TypeJson = {
			kind: 'union',
			alias: 'Other',
			members: [{ kind: 'intrinsic', text: 'null' }]
		};
		const declaration = create_declaration({ name: 'E', kind: 'type', typeInfo: type_info });
		assert.strictEqual(declaration.type_info_expanded, type_info);
	});

	test('a non-composite root passes through unchanged', () => {
		const type_info: TypeJson = { kind: 'reference', name: 'Tome' };
		const declaration = create_declaration({ name: 'E', kind: 'type', typeInfo: type_info });
		assert.strictEqual(declaration.type_info_expanded, type_info);
	});

	test('absent type_info stays absent', () => {
		const declaration = create_declaration({ name: 'E', kind: 'type' });
		assert.strictEqual(declaration.type_info_expanded, undefined);
	});
});

describe('is_internal', () => {
	test('a bare `@internal` (empty message) still marks the declaration', () => {
		const declaration = create_declaration({ name: 'a', kind: 'variable', internalMessage: '' });
		assert.strictEqual(declaration.is_internal, true);
		assert.strictEqual(declaration.internal_message, '');
	});

	test('absent internalMessage means not internal', () => {
		const declaration = create_declaration({ name: 'a', kind: 'variable' });
		assert.strictEqual(declaration.is_internal, false);
	});
});

describe('merged_value', () => {
	test('absent on the wire (stripped default) reads as undefined', () => {
		const declaration = create_declaration({ name: 'A', kind: 'type' });
		assert.strictEqual(declaration.merged_value, undefined);
	});
});
