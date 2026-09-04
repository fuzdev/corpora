<!--
@component

Test harness: sets `library_context` around `TypeLink` so the component can
resolve names against a caller-supplied (typically fake) `Library`.
-->
<script lang="ts">
	import type { TypeJson } from 'svelte-docinfo/types.js';

	import TypeLink from '$lib/TypeLink.svelte';
	import { library_context, type Library } from '$lib/library.svelte.ts';

	const { type, type_info, library }: { type: string; type_info?: TypeJson; library: Library } =
		$props();

	library_context.set(() => library);
</script>

<TypeLink {type} {type_info} />
