<script lang="ts">
	import { page } from '$app/state';

	import ApiIndex from '$lib/ApiIndex.svelte';
	import { DOCS_PATH } from '$lib/docs_helpers.svelte.ts';

	// TODO this is a big strange because we use this page component in tomes, maybe it should be a separate component?
	const at_root = $derived(page.url.pathname === DOCS_PATH);
</script>

<ApiIndex minimal={at_root} />
