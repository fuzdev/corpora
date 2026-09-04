<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import LibrarySummary from '$lib/LibrarySummary.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import TomeLink from '$lib/TomeLink.svelte';
	import { library_context } from '$lib/library.svelte.ts';

	const TOME_SLUG = 'LibrarySummary';
	const tome = tome_get_by_slug(TOME_SLUG);

	const get_library = library_context.get();
	const library = $derived(get_library());
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<p>
			<DeclarationLink name="LibrarySummary" /> renders a compact card for a library and its repo.
			See the <TomeLink slug="Library">Library</TomeLink> for how to construct one from
			<TomeLink slug="vite_plugin_pkg_json" />
			and <a href="https://svelte-docinfo.fuz.dev/"><code>virtual:svelte-docinfo</code></a>:
		</p>
		<Code
			lang="ts"
			content={`import LibrarySummary from '@fuzdev/fuz_ui/LibrarySummary.svelte';`}
		/>
		<Code content={`<LibrarySummary {library} />`} />
	</section>
	<section>
		<LibrarySummary {library} />
	</section>
</TomeContent>
