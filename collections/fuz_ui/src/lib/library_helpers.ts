/**
 * Library documentation URL helpers.
 *
 * Runtime UI helpers for building URLs in the library documentation system.
 * These depend on fuz_ui's documentation paths and SvelteKit's runtime state.
 *
 * For generic package/repository URL helpers, see `@fuzdev/fuz_util/package_helpers.ts`.
 *
 * @module
 */

import { ensure_end, strip_start } from '@fuzdev/fuz_util/string.ts';
import { page } from '$app/state';

/**
 * Convert a full URL to root-relative format by removing the origin.
 *
 * Uses SvelteKit's page state for the current origin by default.
 *
 * @param url - full URL to convert
 * @param origin - origin to strip (defaults to current page origin)
 * @returns root-relative URL starting with '/'
 *
 * @example
 * ```ts
 * // Assuming page.url.origin is 'https://fuz.dev'
 * url_to_root_relative('https://fuz.dev/docs/api')
 * // => '/docs/api'
 * ```
 */
export const url_to_root_relative = (url: string, origin: string = page.url.origin): string => {
	const origin_with_slash = ensure_end(origin, '/');

	if (url === origin || url === origin_with_slash) {
		return '/';
	}

	const stripped = strip_start(url, origin_with_slash);

	if (stripped === url) {
		return url;
	}

	return '/' + stripped;
};
