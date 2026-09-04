import { resolve } from '$app/paths';
import type { Component } from 'svelte';
import { z } from 'zod';
import { ensure_start } from '@fuzdev/fuz_util/string.ts';

import { create_context } from './context_helpers.ts';
import { DOCS_PATH_DEFAULT } from './docs_helpers.svelte.ts';

export const tomes_context = create_context<() => Map<string, Tome>>();

export const tome_context = create_context<() => Tome>();

export const Tome = z.object({
	/**
	 * Stable identifier and URL path segment — must be a URL-safe slug
	 * (used directly as the route segment, the lookup key, and in
	 * `related_tomes` cross-references). Set `title` for the display label.
	 */
	slug: z.string(),
	/**
	 * Human-readable display label shown in menus, headings, and links.
	 * Falls back to `slug` when omitted, so set `title` to give multi-word or
	 * specially cased tomes a readable label (e.g. `slug: 'vite-plugin'` →
	 * `title: 'vite plugin'`).
	 */
	title: z.string().optional(),
	// TODO maybe now this makes sense with mdz? summary: z.string(),
	category: z.string(),
	Component: z.custom<Component<any, any>>(),
	related_tomes: z.array(z.string()),
	related_modules: z.array(z.string()),
	related_declarations: z.array(z.string())
});
export type Tome = z.infer<typeof Tome>;

/**
 * @param hash - URL fragment to append, with or without the `#`
 */
export const tome_to_pathname = (
	item: Tome | string,
	docs_path = DOCS_PATH_DEFAULT,
	hash?: string
): string => {
	const slug = typeof item === 'string' ? item : item.slug;
	const path = docs_path + '/' + slug;
	return resolve((hash ? path + ensure_start(hash, '#') : path) as any);
};

/**
 * The display label for a tome — its `title` if set, else its `slug`.
 */
export const tome_to_title = (tome: Tome): string => tome.title ?? tome.slug;

export const tome_get_by_slug = (slug: string): Tome => {
	const get_tomes = tomes_context.get();
	const tome = get_tomes().get(slug);
	if (!tome) throw Error(`unable to find tome "${slug}"`);
	return tome;
};
