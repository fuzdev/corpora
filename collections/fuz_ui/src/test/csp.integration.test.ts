import { describe, test, assert } from 'vitest';

import { create_csp_directives, COLOR_SCHEME_SCRIPT_HASH, type CspFrameSource } from '$lib/csp.ts';
import { TEST_SOURCES, src, srcs } from './csp_test_helpers.ts';

const { GOOGLE_FONTS, GOOGLE_FONTS_STATIC, CLOUDFLARE_CDN, ANALYTICS, STRIPE } = TEST_SOURCES;
const FUZ_WILDCARD = src('https://*.fuz.dev/');
const FUZ_API = src('https://api.fuz.dev/');
const FUZ_CDN = src('https://cdn.fuz.dev/');

describe('full pipeline integration', () => {
	test('replace_defaults + extend + overrides compose correctly', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'default-src': ['none'],
				'script-src': ['self', COLOR_SCHEME_SCRIPT_HASH],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self'],
				'connect-src': ['self']
			},
			extend: [
				{
					'script-src': [ANALYTICS],
					'connect-src': [ANALYTICS]
				}
			],
			overrides: {
				'connect-src': ['self', ANALYTICS]
			}
		});

		// Whole-CSP deepEqual catches both missing sources and unintended leaks.
		assert.deepEqual(csp, {
			'default-src': ['none'],
			'script-src': ['self', COLOR_SCHEME_SCRIPT_HASH, ANALYTICS],
			'style-src': ['self', 'unsafe-inline'],
			'img-src': ['self'],
			'connect-src': ['self', ANALYTICS]
		});
	});

	test('multiple extend layers compose with library defaults', () => {
		const csp = create_csp_directives({
			extend: [
				// Shared "library" of trusted sources
				{
					'img-src': [FUZ_WILDCARD]
				},
				// App-specific extras
				{
					'connect-src': [FUZ_API],
					'img-src': [FUZ_CDN]
				}
			]
		});

		assert.include(csp['img-src']!, FUZ_WILDCARD);
		assert.include(csp['img-src']!, FUZ_CDN);
		assert.include(csp['connect-src']!, FUZ_API);

		// Library defaults still in place
		assert.include(csp['img-src']!, 'self');
		assert.include(csp['connect-src']!, 'self');
	});
});

describe('real-world SvelteKit scenarios', () => {
	test('Google Fonts (style + font CDN)', () => {
		const csp = create_csp_directives({
			extend: [
				{
					'style-src': [GOOGLE_FONTS, GOOGLE_FONTS_STATIC],
					'font-src': [GOOGLE_FONTS, GOOGLE_FONTS_STATIC]
				}
			]
		});

		assert.include(csp['style-src']!, GOOGLE_FONTS);
		assert.include(csp['style-src']!, GOOGLE_FONTS_STATIC);
		assert.include(csp['font-src']!, GOOGLE_FONTS);
		assert.include(csp['font-src']!, GOOGLE_FONTS_STATIC);

		// Doesn't leak into script-src
		assert.notInclude(csp['script-src']! as Array<any>, GOOGLE_FONTS);
	});

	test('Stripe payment integration', () => {
		const csp = create_csp_directives({
			extend: [
				{
					'script-src': [STRIPE],
					'connect-src': [STRIPE],
					'frame-src': [STRIPE]
				}
			]
		});

		assert.include(csp['script-src']!, STRIPE);
		assert.include(csp['connect-src']!, STRIPE);
		assert.include(csp['frame-src']!, STRIPE);
		assert.notInclude(csp['img-src']! as Array<any>, STRIPE);
		assert.notInclude(csp['style-src']! as Array<any>, STRIPE);
	});

	test('nonce-based script execution preserves baseline', () => {
		const nonce = src('nonce-abc123');

		const csp = create_csp_directives({
			extend: [{ 'script-src': [nonce] }]
		});

		assert.include(csp['script-src']!, nonce);
		assert.include(csp['script-src']!, 'self');
		assert.include(csp['script-src']!, COLOR_SCHEME_SCRIPT_HASH);
	});
});

describe('progressive enhancement patterns', () => {
	test('start strict, layer in shared lib + app-specific extras', () => {
		const shared_lib = { 'img-src': [FUZ_WILDCARD] };

		// Phase 1: defaults only
		const phase1 = create_csp_directives();
		assert.notInclude(phase1['img-src']! as Array<any>, FUZ_WILDCARD);

		// Phase 2: add shared lib
		const phase2 = create_csp_directives({
			extend: [shared_lib]
		});
		assert.include(phase2['img-src']!, FUZ_WILDCARD);

		// Phase 3: add app-specific connect
		const phase3 = create_csp_directives({
			extend: [shared_lib, { 'connect-src': [ANALYTICS] }]
		});
		assert.include(phase3['img-src']!, FUZ_WILDCARD);
		assert.include(phase3['connect-src']!, ANALYTICS);
	});
});

describe('common pitfalls and gotchas', () => {
	test("['none'] in directives blocks everything for that directive", () => {
		const csp = create_csp_directives({
			overrides: {
				'script-src': ['none']
			}
		});

		assert.deepEqual(csp['script-src'], ['none']);
	});

	test('directives static replacement removes default COLOR_SCHEME_SCRIPT_HASH', () => {
		const csp = create_csp_directives({
			overrides: {
				'script-src': ['self'] // Forgot the hash
			}
		});

		assert.notInclude(csp['script-src']! as Array<any>, COLOR_SCHEME_SCRIPT_HASH);
	});

	test('to preserve defaults while adding sources, use extend', () => {
		const correct_csp = create_csp_directives({
			extend: [{ 'script-src': [ANALYTICS] }]
		});

		assert.include(correct_csp['script-src']!, COLOR_SCHEME_SCRIPT_HASH);
		assert.include(correct_csp['script-src']!, ANALYTICS);
	});
});

describe('maximum complexity scenario', () => {
	test('all options at once — whole-CSP deepEqual catches leakage', () => {
		// Whole-CSP deepEqual instead of per-source includes: with explicit replace_defaults the
		// output is fully predictable, so this form catches both "missing source" and
		// "source leaked into a directive it wasn't named in" — partial includes don't.
		const nonce = src('nonce-runtime123');
		const custom_hash = src('sha256-customscript');

		const csp = create_csp_directives({
			replace_defaults: {
				'default-src': ['none'],
				'script-src': ['self', COLOR_SCHEME_SCRIPT_HASH],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'connect-src': ['self'],
				'font-src': ['self'],
				'frame-ancestors': ['self']
			},
			extend: [
				{ 'img-src': [FUZ_WILDCARD] },
				{
					'script-src': [ANALYTICS, CLOUDFLARE_CDN, nonce, custom_hash],
					'connect-src': [ANALYTICS],
					'style-src': [GOOGLE_FONTS, CLOUDFLARE_CDN],
					'font-src': [GOOGLE_FONTS]
				}
			],
			overrides: {
				'connect-src': ['self', ANALYTICS]
			}
		});

		assert.deepEqual(csp, {
			'default-src': ['none'],
			'script-src': [
				'self',
				COLOR_SCHEME_SCRIPT_HASH,
				ANALYTICS,
				CLOUDFLARE_CDN,
				nonce,
				custom_hash
			],
			'style-src': ['self', 'unsafe-inline', GOOGLE_FONTS, CLOUDFLARE_CDN],
			'img-src': ['self', 'data:', FUZ_WILDCARD],
			'connect-src': ['self', ANALYTICS],
			'font-src': ['self', GOOGLE_FONTS],
			'frame-ancestors': ['self']
		});
	});

	test('full-pipeline idempotence — same options produce deepEqual results', () => {
		const options = {
			replace_defaults: { 'img-src': ['self', 'data:'] } as any,
			extend: [
				{ 'img-src': [FUZ_WILDCARD] },
				{ 'connect-src': [ANALYTICS], 'script-src': [CLOUDFLARE_CDN] }
			],
			overrides: { 'frame-ancestors': srcs<CspFrameSource>('self', 'https://parent.fuz.dev') }
		};

		const csp1 = create_csp_directives(options);
		const csp2 = create_csp_directives(options);

		assert.deepEqual(csp1, csp2);
	});
});
