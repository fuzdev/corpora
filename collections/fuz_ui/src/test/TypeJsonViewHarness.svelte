<!--
@component

Test harness: sets `library_context` around `TypeJsonView` so the component
can resolve names against a caller-supplied (typically fake) `Library`.
-->
<script lang="ts">
	import type { TypeJson } from 'svelte-docinfo/types.js';

	import TypeJsonView from '$lib/TypeJsonView.svelte';
	import { library_context, type Library } from '$lib/library.svelte.ts';

	const { type_info, library, title }: { type_info: TypeJson; library: Library; title?: string } =
		$props();

	library_context.set(() => library);
</script>

<TypeJsonView {type_info} {title} />
