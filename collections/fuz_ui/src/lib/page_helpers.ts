/**
 * Helpers for relating links to the current page.
 *
 * @module
 */

/** A pathname without its trailing slash, except the root's. */
const strip_trailing_slash = (pathname: string): string =>
	pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

/**
 * Whether `href` leads to the page at `url`: the same origin and pathname, with a
 * trailing slash, the query, and the hash ignored. A relative `href` resolves
 * against `url`, as a browser resolves it.
 *
 * @param href - a link's `href`, absolute or relative
 * @param url - the current page's url, e.g. SvelteKit's readonly `page.url`
 * @returns `false` for an `href` that isn't a valid url
 */
export const href_is_current_page = (
	href: string,
	url: Pick<URL, 'href' | 'origin' | 'pathname'>
): boolean => {
	if (!URL.canParse(href, url.href)) return false;
	const target = new URL(href, url.href);
	return (
		target.origin === url.origin &&
		strip_trailing_slash(target.pathname) === strip_trailing_slash(url.pathname)
	);
};
