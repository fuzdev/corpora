import type { CspDirectives } from './csp.ts';

/**
 * Per-directive sources that allow full interop between fuzdev/sister sites
 * (`*.fuz.dev`, `*.zzz.software`) — loading assets and APIs from each other,
 * and iframing in both directions.
 *
 * Pass into `create_csp_directives({extend: [csp_directives_of_fuzdev]})`.
 * Intended for sites within the ecosystem; external apps usually want a
 * narrower, hand-written allow-list.
 *
 * Deliberately scoped — `script-src`, `style-src`, `worker-src`, etc. are not
 * granted, even between sister sites. Add at the call site if a specific page
 * needs them.
 */
export const csp_directives_of_fuzdev: Partial<CspDirectives> = {
	'img-src': ['https://*.fuz.dev/', 'https://*.zzz.software/'],
	'media-src': ['https://*.fuz.dev/', 'https://*.zzz.software/'],
	'font-src': ['https://*.fuz.dev/', 'https://*.zzz.software/'],
	'connect-src': ['https://*.fuz.dev/', 'https://*.zzz.software/'],
	'frame-src': ['https://*.fuz.dev/', 'https://*.zzz.software/'],
	'frame-ancestors': ['https://*.fuz.dev/', 'https://*.zzz.software/']
	// `child-src` is intentionally omitted — it defaults to `['none']`, and `extend` cannot
	// append to a `'none'`-valued directive. Including it here would break the common
	// `create_csp_directives({extend: [csp_directives_of_fuzdev]})` call. `frame-src` is its
	// fallback target anyway, so direct opt-in via `frame-src` is the supported path.
};
