<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import LibraryDetail from '$lib/LibraryDetail.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import TomeLink from '$lib/TomeLink.svelte';
	import { library_context } from '$lib/library.svelte.ts';

	const TOME_SLUG = 'LibraryDetail';
	const tome = tome_get_by_slug(TOME_SLUG);

	const get_library = library_context.get();
	const library = $derived(get_library());
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<p>
			<DeclarationLink name="LibraryDetail" /> renders the full metadata for a library and its repo,
			including its module and declaration index. See the <TomeLink slug="Library" /> for how to
			construct one from
			<TomeLink slug="vite_plugin_pkg_json" />
			and <a href="https://svelte-docinfo.fuz.dev/"><code>virtual:svelte-docinfo</code></a>:
		</p>
		<Code lang="ts" content={`import LibraryDetail from '@fuzdev/fuz_ui/LibraryDetail.svelte';`} />
		<Code content={`<LibraryDetail {library} />`} />
		<p>
			It projects its <code>library</code> prop into <DeclarationLink name="library_context" /> for
			its subtree, so the module and declaration links resolve against the rendered library even
			when it differs from the site's own. When rendering a foreign library, pass
			<code>links_full</code>
			so the links point at the library's deployed docs instead of site-local paths:
		</p>
		<Code content={`<LibraryDetail library={foreign_library} links_full />`} />
	</section>
	<section>
		<LibraryDetail {library} />
	</section>
</TomeContent>
