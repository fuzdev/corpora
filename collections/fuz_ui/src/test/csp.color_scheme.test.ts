import { test, assert, describe } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { COLOR_SCHEME_SCRIPT, COLOR_SCHEME_SCRIPT_HASH } from '$lib/csp.ts';

// The CSP admits the color-scheme loader by hash, so three things have to agree byte-for-byte:
// the inline script in `app.html`, the `COLOR_SCHEME_SCRIPT` copy of it, and the hash of that
// copy. Nothing at runtime notices when they drift — the loader is silently blocked and every
// cold load flashes the wrong scheme — so the agreement is pinned here instead.

const to_inline_script = (html: string): string => {
	const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
	assert(script !== undefined, 'expected an inline <script> in the html');
	return script;
};

const to_csp_hash = (script: string): string =>
	'sha256-' + createHash('sha256').update(script).digest('base64');

describe('color-scheme loader hash', () => {
	test('COLOR_SCHEME_SCRIPT_HASH is the sha256 of COLOR_SCHEME_SCRIPT', () => {
		assert.equal(COLOR_SCHEME_SCRIPT_HASH, to_csp_hash(COLOR_SCHEME_SCRIPT));
	});

	test('app.html embeds COLOR_SCHEME_SCRIPT verbatim', () => {
		assert.equal(to_inline_script(readFileSync('src/app.html', 'utf8')), COLOR_SCHEME_SCRIPT);
	});
});
