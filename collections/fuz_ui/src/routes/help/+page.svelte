<script lang="ts">
	import Alert from '$lib/Alert.svelte';
	import GithubLink from '$lib/GithubLink.svelte';
</script>

<div class="width_atmost_md m_auto">
	<Alert status="help">todo</Alert>
	<div>
		<GithubLink path="fuzdev/fuz_ui/issues" />
	</div>
</div>

<style>
	div {
		padding: var(--space_xl) 0;
		text-align: center;
	}
</style>
