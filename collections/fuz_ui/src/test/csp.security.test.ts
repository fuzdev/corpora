import { test, assert, describe } from 'vitest';

import { create_csp_directives, COLOR_SCHEME_SCRIPT_HASH } from '$lib/csp.ts';
import { src } from './csp_test_helpers.ts';

describe('default security posture — properties (decoupled from exact defaults)', () => {
	// These are property tests — what *must* be true for security regardless of exact default
	// values. Exact defaults are pinned in csp.base.test.ts's snapshot; do not duplicate here.
	test('script-src does not include unsafe-inline by default', () => {
		const csp = create_csp_directives();
		assert.notInclude(csp['script-src']! as Array<any>, 'unsafe-inline');
	});

	test('script-src does not include unsafe-eval by default (wasm-unsafe-eval is allowed)', () => {
		const csp = create_csp_directives();
		assert.notInclude(csp['script-src']! as Array<any>, 'unsafe-eval');
		assert.include(csp['script-src']! as Array<any>, 'wasm-unsafe-eval');
	});

	test('worker-src does not include unsafe-eval by default (wasm-unsafe-eval is allowed)', () => {
		const csp = create_csp_directives();
		assert.notInclude(csp['worker-src']! as Array<any>, 'unsafe-eval');
		assert.include(csp['worker-src']! as Array<any>, 'wasm-unsafe-eval');
	});
});

describe('XSS protection — script source allowlist properties', () => {
	test('script-src by default contains only self, wasm-unsafe-eval, and sha256 hashes', () => {
		// Property: no external host or scheme source by default.
		const csp = create_csp_directives();

		assert.include(csp['script-src']!, 'self');
		const non_baseline = csp['script-src']!.filter(
			(v) => v !== 'self' && v !== 'wasm-unsafe-eval' && !v.startsWith('sha256-')
		);
		assert.deepEqual(non_baseline, [], 'no external domains by default');
	});

	test('audit-log: a source extended onto script-src lands only there', () => {
		// The library's central claim: "every user-added source is named at exactly one site."
		const untrusted = src('untrusted-cdn.fuz.dev');

		// Adding to img-src does NOT grant script-src — sources land only where named.
		const csp_img = create_csp_directives({
			extend: [{ 'img-src': [untrusted] }]
		});
		assert.include(csp_img['img-src']!, untrusted);
		assert.notInclude(csp_img['script-src']! as Array<any>, untrusted);

		// Explicit extend on script-src is the only path.
		const csp_script = create_csp_directives({
			extend: [{ 'script-src': [untrusted] }]
		});
		assert.include(csp_script['script-src']!, untrusted);
	});

	test('audit-log: a unique source extended into one directive appears in no other', () => {
		// Central library claim, parameterized: extending source X onto directive D leaves X
		// absent from every other directive in the output.
		const targets: Array<
			'img-src' | 'script-src' | 'connect-src' | 'font-src' | 'style-src' | 'frame-src'
		> = ['img-src', 'script-src', 'connect-src', 'font-src', 'style-src', 'frame-src'];

		for (const target of targets) {
			const unique_source = src(`unique-${target}.fuz.dev`);

			const csp = create_csp_directives({
				extend: [{ [target]: [unique_source] }]
			});

			assert.include(csp[target]!, unique_source, `${unique_source} should appear in ${target}`);

			for (const [directive, value] of Object.entries(csp)) {
				if (directive === target || !Array.isArray(value)) continue;
				assert.notInclude(
					value,
					unique_source,
					`${unique_source} leaked into ${directive} but was only added to ${target}`
				);
			}
		}
	});
});

describe('defense in depth with styles', () => {
	test('styles allow unsafe-inline but restrict network sources', () => {
		const csp = create_csp_directives();

		assert.include(csp['style-src']!, 'unsafe-inline');
		assert.include(csp['style-src']!, 'self');
	});

	test('external stylesheets must be explicitly added to style-src', () => {
		const external_styles = src('blog.fuz.dev');

		const csp_default = create_csp_directives();
		assert.notInclude(csp_default['style-src']! as Array<any>, external_styles);

		// Adding to img-src doesn't grant style-src.
		const csp_img = create_csp_directives({
			extend: [{ 'img-src': [external_styles] }]
		});
		assert.notInclude(csp_img['style-src']! as Array<any>, external_styles);

		// Explicit extend on style-src is required.
		const csp_style = create_csp_directives({
			extend: [{ 'style-src': [external_styles] }]
		});
		assert.include(csp_style['style-src']!, external_styles);
	});
});

describe('hash-based script execution', () => {
	test('COLOR_SCHEME_SCRIPT_HASH is included by default', () => {
		const csp = create_csp_directives();

		assert.include(csp['script-src']!, COLOR_SCHEME_SCRIPT_HASH);
		assert.include(csp['script-src-elem']!, COLOR_SCHEME_SCRIPT_HASH);
	});
});

describe('nonce-based script execution', () => {
	test('nonces can be added via extend', () => {
		const nonce = src('nonce-random123456');

		const csp = create_csp_directives({
			extend: [{ 'script-src': [nonce] }]
		});

		assert.include(csp['script-src']!, nonce);
	});
});

describe('preventing common misconfigurations', () => {
	test('cannot accidentally allow all sources via wildcard', () => {
		const csp = create_csp_directives();

		for (const [directive, value] of Object.entries(csp)) {
			if (Array.isArray(value)) {
				assert.notInclude(value, '*', `${directive} should not include wildcard`);
			}
		}
	});
});

describe('secure defaults for data URIs and special schemes', () => {
	test('data URIs are allowed only for specific resource types', () => {
		const csp = create_csp_directives();

		assert.include(csp['img-src']!, 'data:');
		assert.include(csp['font-src']!, 'data:');
		assert.notInclude(csp['script-src']! as Array<any>, 'data:');
		assert.notInclude(csp['style-src']! as Array<any>, 'data:');
	});

	test('blob: URIs are restricted to appropriate contexts', () => {
		const csp = create_csp_directives();

		assert.include(csp['img-src']!, 'blob:');
		assert.include(csp['media-src']!, 'blob:');
		assert.include(csp['worker-src']!, 'blob:');
		assert.notInclude(csp['script-src']! as Array<any>, 'blob:');
	});
});
