<script lang="ts">
	import BreadcrumbExample from '$routes/docs/Breadcrumb/BreadcrumbExample.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
</script>

<TomeSection>
	<TomeSectionHeader text="Custom paths" />
	<BreadcrumbExample selected_path="/a/b" />
</TomeSection>
