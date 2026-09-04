<script lang="ts">
	import ApiModule from '$lib/ApiModule.svelte';

	const { params } = $props();

	const module_path = $derived(params.module_path ?? '');
</script>

<ApiModule {module_path} />
