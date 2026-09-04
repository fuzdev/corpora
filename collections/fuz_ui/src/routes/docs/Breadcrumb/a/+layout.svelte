<script lang="ts">
	import type { Snippet } from 'svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import TomeContent from '$lib/TomeContent.svelte';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	const TOME_SLUG = 'Breadcrumb';

	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<TomeContent {tome}>
	{@render children()}
</TomeContent>
