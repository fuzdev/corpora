import type { Url } from '@fuzdev/fuz_util/url.ts';
import type { PkgJson } from '@fuzdev/fuz_util/pkg_json.ts';

import { create_context } from './context_helpers.ts';
import { repo_url_parse } from '@fuzdev/fuz_util/package_helpers.ts';
import type { SvgData } from './svg.ts';

export interface SiteStateOptions {
	/**
	 * The site's icon, e.g. a logo from `logos.ts`.
	 */
	icon?: SvgData | null;
	/**
	 * The site's glyph, a single unicode character identifying the project.
	 * Falls back to `pkg_json.glyph`.
	 */
	glyph?: string | null;
	/**
	 * The site's source repository url, e.g. for `DocsFooter` links.
	 * Falls back to the url parsed from `pkg_json.repository`.
	 */
	repo_url?: Url | null;
	/**
	 * Curated `package.json`, typically the default export of `virtual:pkg.json`.
	 * `glyph` and `repo_url` derive from it when not given explicitly; explicit
	 * props always win.
	 */
	pkg_json?: PkgJson | null;
}

/**
 * Light site-identity values for app chrome - the icon, glyph, and repo url used
 * by components like `Breadcrumb` and `DocsFooter`. Set once per app at the root
 * layout. Distinct from `library_context`, which carries the heavy
 * module/declaration metadata that only docs and API pages need.
 *
 * Pass `pkg_json` (from `virtual:pkg.json`) to derive `glyph`/`repo_url` from the
 * package's own metadata instead of hardcoding them; `icon` stays an explicit
 * logo import since it's structured `SvgData`, not package metadata.
 */
export class SiteState {
	icon: SvgData | null = $state.raw(null);
	glyph: string | null = $state.raw(null);
	repo_url: Url | null = $state.raw(null);

	constructor(options: SiteStateOptions = {}) {
		this.icon = options.icon ?? null;
		this.glyph = options.glyph ?? options.pkg_json?.glyph ?? null;
		this.repo_url =
			options.repo_url ?? (options.pkg_json ? repo_url_parse(options.pkg_json.repository) : null);
	}
}

export const site_context = create_context<SiteState>();
