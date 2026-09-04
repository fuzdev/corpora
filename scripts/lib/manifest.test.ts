import assert from 'node:assert/strict';

import { is_clean_path, is_included_path, is_under, validate_manifest } from './manifest.ts';

const include = new Set(['ts', 'svelte', 'md']);

Deno.test('is_included_path keeps included extensions outside excluded prefixes', () => {
	assert.equal(is_included_path('src/lib/a.ts', include, []), true);
	assert.equal(is_included_path('src/lib/A.SVELTE', include, []), true);
	assert.equal(is_included_path('src/lib/a.svelte.ts', include, []), true);
	assert.equal(is_included_path('src/lib/a.json', include, []), false);
	assert.equal(is_included_path('src/lib/Makefile', include, []), false);
	assert.equal(is_included_path('src/lib/.gitignore', include, []), false);
	assert.equal(is_included_path('src/test/fixtures/a.ts', include, ['src/test/fixtures']), false);
	assert.equal(is_included_path('src/test/fixtures.ts', include, ['src/test/fixtures']), true);
	assert.equal(
		is_included_path('src/test/fixtures_more/a.ts', include, ['src/test/fixtures']),
		true
	);
});

Deno.test('is_under is prefix-by-segment, not by string', () => {
	assert.equal(is_under('a/b/c', 'a/b'), true);
	assert.equal(is_under('a/b', 'a/b'), true);
	assert.equal(is_under('a/bc', 'a/b'), false);
});

Deno.test('is_clean_path rejects traversal and decoration', () => {
	for (const ok of ['src', 'packages/kit/src', 'a.b/c-d_e'])
		assert.equal(is_clean_path(ok), true, ok);
	for (const bad of ['', '/src', 'src/', './src', 'a/../b', 'a//b', 42]) {
		assert.equal(is_clean_path(bad), false, String(bad));
	}
});

const valid = {
	version: 1,
	include: ['ts'],
	collections: [
		{
			name: 'x',
			url: 'https://github.com/o/x',
			commit: 'a'.repeat(40),
			subpaths: ['src'],
			exclude: ['src/test/fixtures'],
			license: { spdx: 'MIT', file: 'LICENSE' },
			shaped_by: 'tsv'
		}
	]
};

Deno.test('validate_manifest accepts a valid manifest', () => {
	assert.deepEqual(validate_manifest(valid), []);
});

Deno.test('validate_manifest names every problem', () => {
	const broken = structuredClone(valid) as Record<string, unknown>;
	const c = (broken.collections as Array<Record<string, unknown>>)[0];
	c.commit = 'abc';
	c.exclude = ['elsewhere/fixtures'];
	c.license = { spdx: 'BUSL-1.1', file: 'LICENSE' };
	c.shaped_by = 'biome';
	(broken.collections as unknown[]).push({ ...valid.collections[0] });
	const problems = validate_manifest(broken);
	assert.ok(
		problems.some((p) => p.includes('commit')),
		'commit'
	);
	assert.ok(
		problems.some((p) => p.includes('not under any subpath')),
		'exclude'
	);
	assert.ok(
		problems.some((p) => p.includes('not permissive')),
		'license'
	);
	assert.ok(
		problems.some((p) => p.includes('shaped_by')),
		'shaped_by'
	);
	assert.ok(
		problems.some((p) => p.includes('duplicated')),
		'duplicate name'
	);
});

Deno.test('validate_manifest requires the current version', () => {
	assert.ok(validate_manifest({ ...valid, version: 2 }).some((p) => p.includes('version')));
});

Deno.test('validate_manifest requires exactly one license source', () => {
	const both = structuredClone(valid) as Record<string, unknown>;
	(both.collections as Array<Record<string, unknown>>)[0].license = {
		spdx: 'MIT',
		file: 'LICENSE',
		declared_in: 'package.json'
	};
	assert.ok(validate_manifest(both).some((p) => p.includes('exactly one')));
});
