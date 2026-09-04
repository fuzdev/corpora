<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import { resolve } from '$app/paths';

	import Breadcrumb from '$lib/Breadcrumb.svelte';

	const {
		selected_path
	}: {
		selected_path: string;
	} = $props();
</script>

<Code
	content={`<Breadcrumb
	path="/a/b/c/d"
	selected_path="${selected_path}"
	base_path={resolve('/docs/Breadcrumb')}
>
	<span class="font_size_xl">🔡</span>
	{#snippet separator()}.{/snippet}
</Breadcrumb>`}
/>
<Breadcrumb path="/a/b/c/d" {selected_path} base_path={resolve('/docs/Breadcrumb')}>
	<span class="font_size_xl">🔡</span>
</Breadcrumb>
