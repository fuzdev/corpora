import { test, assert, describe } from 'vitest';
import type { KitConfig } from '@sveltejs/kit';
import type { Defined } from '@fuzdev/fuz_util/types.ts';

import { create_csp_directives, type CspDirectives } from '$lib/csp.ts';
import { src } from './csp_test_helpers.ts';

// SvelteKit-specific tests only — real-world scenarios (Stripe, analytics, Google Fonts,
// CDN, hash/nonce) and conditional patterns are covered in csp.integration.test.ts.

describe('SvelteKit type compatibility', () => {
	test('CspDirectives is assignable to SvelteKit CSP directives type', () => {
		type KitCspDirectives = Defined<KitConfig['csp']>['directives'];

		const csp: CspDirectives = create_csp_directives();
		const kit_csp: KitCspDirectives = csp;

		assert.ok(kit_csp);
		assert.property(kit_csp, 'script-src');
	});

	test('individual directive types match SvelteKit expectations', () => {
		const csp = create_csp_directives();

		assert.ok(Array.isArray(csp['script-src']));
		assert.ok(Array.isArray(csp['style-src']));
		assert.ok(Array.isArray(csp['img-src']));

		assert.strictEqual(typeof csp['upgrade-insecure-requests'], 'boolean');
	});

	test('empty CSP is valid for SvelteKit', () => {
		type KitCspDirectives = Defined<KitConfig['csp']>['directives'];

		const empty_csp: CspDirectives = {};
		const kit_csp: KitCspDirectives = empty_csp;

		assert.deepEqual(kit_csp, {});
	});
});

describe('SvelteKit reporting endpoint', () => {
	// CSP reporting goes through SvelteKit's report-to handling, distinct from source allowlists.
	test('report-to via replace_defaults', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'report-to': ['csp-endpoint']
			}
		});

		assert.deepEqual(csp['report-to'], ['csp-endpoint']);
	});

	test('report-to via overrides', () => {
		const csp = create_csp_directives({
			overrides: {
				'report-to': ['csp-violations']
			}
		});

		assert.deepEqual(csp['report-to'], ['csp-violations']);
	});
});

describe('conditional configuration', () => {
	// The dev/prod split via extend is a recommended SvelteKit pattern: build the extend
	// array based on env (`is_dev ? [{'script-src': ['unsafe-eval']}] : []`).
	test('production omits dev-only sources', () => {
		const prod_csp = create_csp_directives({ extend: [] });
		assert.notInclude(prod_csp['script-src']! as Array<any>, 'unsafe-eval');
	});

	test('development extends with unsafe-eval for HMR', () => {
		const dev_csp = create_csp_directives({
			extend: [{ 'script-src': ['unsafe-eval'] }]
		});
		assert.include(dev_csp['script-src']!, 'unsafe-eval');
		assert.include(dev_csp['script-src']!, 'self');
	});
});

describe('upgrade-insecure-requests', () => {
	// Boolean-valued directive — exercises the non-array directive path that SvelteKit consumes.
	test('enabled by default', () => {
		const csp = create_csp_directives();
		assert.strictEqual(csp['upgrade-insecure-requests'], true);
	});

	test('can disable via overrides', () => {
		const csp = create_csp_directives({
			overrides: { 'upgrade-insecure-requests': false }
		});

		assert.strictEqual(csp['upgrade-insecure-requests'], false);
	});
});

describe('frame-ancestors for iframe embedding', () => {
	// frame-ancestors has no fallback to default-src and isn't well-tested elsewhere.
	test('restricts embedding to self by default', () => {
		const csp = create_csp_directives();
		assert.deepEqual(csp['frame-ancestors'], ['self']);
	});

	test('extended for widget use case', () => {
		const parent_site = src('parent.fuz.dev');

		const csp = create_csp_directives({
			extend: [{ 'frame-ancestors': [parent_site] }]
		});

		assert.include(csp['frame-ancestors']!, parent_site);
	});
});
