<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import GithubLink from '#lib/GithubLink.svelte';
	import { tome_get_by_slug } from '#lib/tome.ts';
	import TomeContent from '#lib/TomeContent.svelte';
	import DeclarationLink from '#lib/DeclarationLink.svelte';
	import TomeLink from '#lib/TomeLink.svelte';

	const TOME_SLUG = 'Docs';
	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->
<!-- eslint-disable no-useless-escape -->

<TomeContent {tome}>
	<section>
		<p>
			<DeclarationLink name="Docs" /> is the top-level component behind fuz_ui's docs system, which
			is used to construct this page, and all of the other <code>/docs</code> pages in the Fuz
			stack. It has a three-column responsive layout with managed navigation and uses ordinary
			SvelteKit patterns: it takes an array of <DeclarationLink name="Tome" />s and renders the
			current page as <code>children</code>, so it lives in a <code>+layout.svelte</code> wrapping
			your docs routes.
		</p>
		<p>
			It requires two contexts: <code>site_context</code> (a <DeclarationLink name="SiteState" />
			for components like <TomeLink slug="Breadcrumb" />) set once at the root layout (typically the
			root, anywhere up the tree works), and <code>library_context</code> (a
			<DeclarationLink name="Library" />) set in the docs layout:
		</p>
		<Code
			lang="svelte"
			content={`<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import {SiteState, site_context} from '@fuzdev/fuz_ui/site.svelte.js';
  import pkg_json from 'virtual:pkg.json';

  site_context.set(new SiteState({pkg_json}));
<\/script>`}
		/>
		<Code
			lang="svelte"
			content={`<!-- src/routes/docs/+layout.svelte -->
<script lang="ts">
  import Docs from '@fuzdev/fuz_ui/Docs.svelte';
  import {Library, library_context} from '@fuzdev/fuz_ui/library.svelte.js';
  import {library_json} from '#routes/library.ts';
  import {tomes} from '#routes/docs/tomes.ts';

  const {children} = $props();

  const library = new Library(library_json);
  library_context.set(() => library);
<\/script>

<Docs {tomes}>
  {@render children()}
</Docs>`}
		/>
		<p>
			Optional snippets add to the layout: <code>primary_nav</code> renders in the top bar after the
			breadcrumb, <code>secondary_nav_header</code> and <code>secondary_nav_footer</code> above and
			below the tome menu (in the sidebar, and in the menu dialog on narrow screens, where the top
			bar has little room), and <code>footer</code> replaces the default footer, which links to
			fuz.dev:
		</p>
		<Code
			lang="svelte"
			content={`<Docs {tomes}>
  {#snippet primary_nav()}
    <a href={resolve('/results')}>results</a>
  {/snippet}
  {#snippet footer()}
    <DocsFooter repo_url={site.repo_url} />
  {/snippet}
  {@render children()}
</Docs>`}
		/>
		<p>
			For live and complete examples, see the docs layouts in
			<GithubLink path="fuzdev/fuz_ui/blob/main/src/routes/docs/%2Blayout.svelte">
				fuz_ui
			</GithubLink>
			or
			<GithubLink path="fuzdev/fuz_css/blob/main/src/routes/docs/%2Blayout.svelte">
				fuz_css
			</GithubLink>.
		</p>
	</section>
</TomeContent>
