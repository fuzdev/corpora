<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import Teleport from '$lib/Teleport.svelte';
	import TomeContent from '$lib/TomeContent.svelte';

	const TOME_SLUG = 'Teleport';
	const tome = tome_get_by_slug(TOME_SLUG);

	let swap = $state.raw(true);
	let port1: HTMLElement | undefined = $state.raw();
	let port2: HTMLElement | undefined = $state.raw();
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<p>
			Relocates elements in the DOM, in the rare cases that's useful and the best solution. (like
			when you need to escape overflow containment or avoid inheriting styles without restructuring
			the component tree) Does not work with SSR.
		</p>
		<aside>
			<p>Use only when necessary or fun.</p>
		</aside>
	</section>
	<section>
		<!-- TODO make this a generic data-driven helper -->
		<Code lang="ts" content={`import Teleport from '@fuzdev/fuz_ui/Teleport.svelte';`} />
		<Code
			content={`<Teleport to={swap ? port1 : port2}>
	🐰
</Teleport>
<div class="ports">
	<div bind:this={port1} class="panel" />
	<div bind:this={port2} class="panel" />
</div>
<button onclick={() => (swap = !swap)}>
	teleport the bunny
</button>`}
		/>
	</section>
	<section>
		<!-- TODO how to do this with the `state` API? the `bind` in particular -- maybe make them stores? -->
		<Teleport to={swap ? port1 : port2}>🐰</Teleport>
		<div class="ports">
			<div bind:this={port1} class="panel"></div>
			<div bind:this={port2} class="panel"></div>
		</div>
		<button type="button" onclick={() => (swap = !swap)}>teleport the bunny</button>
	</section>
</TomeContent>

<style>
	.ports {
		display: flex;
		gap: var(--space_sm);
		margin-bottom: var(--space_sm);
	}
	.ports > div {
		width: var(--space_xl8);
		height: var(--space_xl8);
		font-size: var(--font_size_xl3);
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
