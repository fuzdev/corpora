<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import EcosystemLinks from './EcosystemLinks.svelte';
	import ProjectLinks from './ProjectLinks.svelte';

	const {
		children,
		...rest
	}: SvelteHTMLElements['section'] & {
		children?: Snippet;
	} = $props();
</script>

<section {...rest} class="panel p_lg {rest.class}">
	{#if children}
		{@render children()}
	{:else}
		<h2 class="mt_0 mb_lg">Links</h2>
	{/if}
	<section>
		<EcosystemLinks />
	</section>
	<section>
		<ProjectLinks />
	</section>
</section>
