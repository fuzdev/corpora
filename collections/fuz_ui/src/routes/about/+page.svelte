<script lang="ts">
	import { Library, library_context } from '$lib/library.svelte.ts';
	import EcosystemLinksPanel from '$lib/EcosystemLinksPanel.svelte';
	import LibraryDetail from '$lib/LibraryDetail.svelte';
	import DocsFooter from '$lib/DocsFooter.svelte';
	import Breadcrumb from '$lib/Breadcrumb.svelte';
	import { FUZ_DEV_URL, MAIN_HEADER_MARGIN_TOP } from '$lib/constants.ts';
	import { site_context } from '$lib/site.svelte.ts';
	import { library_json } from '$routes/library.ts';

	const library = new Library(library_json);
	library_context.set(() => library);
	const site = site_context.get();

	// TODO standardize
</script>

<main class="width_atmost_md">
	<section>
		<header class="box">
			<h1 class="mb_xl5" style:margin-top={MAIN_HEADER_MARGIN_TOP}>
				{library.repo_name}
			</h1>
		</header>
		<Breadcrumb />
	</section>
	<EcosystemLinksPanel />
	<section class="box width:100% mb_lg">
		<div class="panel p_md width_atmost_md">
			<LibraryDetail {library} />
		</div>
	</section>
	<section class="box mb_xl7">
		<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL}>
			<div class="mb_xl5">
				<Breadcrumb />
			</div>
		</DocsFooter>
	</section>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0 auto;
	}
	h1 {
		display: flex;
		align-items: baseline;
		text-align: center;
	}
</style>
