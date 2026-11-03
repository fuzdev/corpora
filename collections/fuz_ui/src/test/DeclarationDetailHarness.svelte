<!--
@component

Test harness: sets `library_context` around `DeclarationDetail` so its
`ModuleLink` can resolve against a caller-supplied (typically fake) `Library`.
-->
<script lang="ts">
	import DeclarationDetail from '#lib/DeclarationDetail.svelte';
	import type { Declaration } from '#lib/declaration.svelte.ts';
	import { library_context, type Library } from '#lib/library.svelte.ts';

	const { declaration, library }: { declaration: Declaration; library: Library } = $props();

	library_context.set(() => library);
</script>

<DeclarationDetail {declaration} />
