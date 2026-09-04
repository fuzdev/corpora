import type { CspSource } from '$lib/csp.ts';

/**
 * Casts a string to `CspSource` for tests. The `CspSource` template-literal
 * types don't always widen from arbitrary string literals, so this centralizes
 * the cast and makes the intent ("typed CSP source") clearer than `as any`.
 */
export const src = (s: string): CspSource => s as CspSource;

/**
 * Like `src` but for arrays. Defaults to `Array<CspSource>`; pass a generic
 * argument to target a more specific source type (e.g. `srcs<CspFrameSource>`).
 */
export const srcs = <T = CspSource>(...vals: Array<string>): Array<T> => vals as Array<T>;

/**
 * Named real-world test domains used across CSP test files.
 * Use `src()` directly for one-off placeholder values.
 */
export const TEST_SOURCES = {
	GOOGLE_FONTS: src('fonts.googleapis.com'),
	GOOGLE_FONTS_STATIC: src('fonts.gstatic.com'),
	CLOUDFLARE_CDN: src('cdnjs.cloudflare.com'),
	ANALYTICS: src('analytics.fuz.dev'),
	STRIPE: src('js.stripe.com')
} as const;
