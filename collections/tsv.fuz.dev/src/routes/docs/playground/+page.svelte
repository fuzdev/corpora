<script lang="ts">
	import { page } from '$app/state';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';

	import Playground from './Playground.svelte';

	const tome = tome_get_by_slug('playground');

	// The `/docs` index renders every tome's component via `DocsContent`, which would
	// mount `Playground` and pull in its ~900KB-gzipped WASM. Guard like fuz_css's api tome:
	// show only a link at the root, the full playground at `/docs/playground`.
	const at_root = $derived(page.url.pathname === DOCS_PATH);
</script>

<TomeContent {tome}>
	{#if at_root}
		<section>
			<p>Try tsv's formatter and parser live in the <TomeLink slug="playground" />.</p>
		</section>
	{:else}
		<section>
			<p>
				This loads
				<a href="https://www.npmjs.com/package/@fuzdev/tsv_wasm"><code>@fuzdev/tsv_wasm</code></a>
				in your browser to format and parse Svelte with TypeScript and CSS.
			</p>
			<Playground />
			<p>
				See the <TomeLink slug="introduction" /> for setup and API usage. The textarea above uses
				<a href="https://code.fuz.dev/">fuz_code</a>'s
				<a href="https://code.fuz.dev/docs/api/CodeTextarea.svelte"><code>CodeTextarea</code></a>
				component.
			</p>
		</section>
	{/if}
</TomeContent>
