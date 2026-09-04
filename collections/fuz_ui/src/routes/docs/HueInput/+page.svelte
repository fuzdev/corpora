<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import HueInput from '$lib/HueInput.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';

	const TOME_SLUG = 'HueInput';
	const tome = tome_get_by_slug(TOME_SLUG);

	let value: number = $state.raw(180);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<Code lang="ts" content={`import HueInput from '@fuzdev/fuz_ui/HueInput.svelte';`} />
	</section>
	<TomeSection>
		<TomeSectionHeader text="With bind:value">With <code>bind:value</code></TomeSectionHeader>
		<Code content={`<HueInput bind:value />`} />
		<HueInput bind:value />
		<div class="mt_md" style:--text_color="oklch(0.45 0.11 {value})">
			<code>bind:value === {value}</code>
		</div>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With children">With <code>children</code></TomeSectionHeader>
		<Code
			content={`<HueInput>
	Some colorful hue input
</HueInput>`}
		/>
		<HueInput>Some colorful hue input</HueInput>
	</TomeSection>
</TomeContent>
