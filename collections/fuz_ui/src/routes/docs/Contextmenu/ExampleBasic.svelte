<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import Contextmenu from '$lib/Contextmenu.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	const selected = selected_contextmenu_root_component_context.get();
	const ContextmenuRootComponent = $derived(selected.component);
	const root_component_name = $derived(selected.name);

	let greeted = $state.raw(false);
	let greeted_icon_snippet = $state.raw(false);
	let greeted_icon_string = $state.raw(false);
</script>

<ContextmenuRootComponent scoped>
	<TomeSection>
		<TomeSectionHeader text="Basic usage" />
		<Contextmenu>
			{#snippet entries()}
				<ContextmenuEntry run={() => void (greeted = !greeted)}>Hello world</ContextmenuEntry>
				<ContextmenuEntry run={() => void (greeted_icon_snippet = !greeted_icon_snippet)}>
					{#snippet icon()}🌞{/snippet}
					Hello with an optional icon snippet
				</ContextmenuEntry>
				<ContextmenuEntry run={() => void (greeted_icon_string = !greeted_icon_string)} icon="🌚">
					Hello with an optional icon string
				</ContextmenuEntry>
			{/snippet}
			<div class="panel p_md">
				<p>Try opening the contextmenu on this panel with rightclick or tap-and-hold.</p>
				<Code
					content={`<${root_component_name} scoped>
  <Contextmenu>
    {#snippet entries()}
      <ContextmenuEntry run={() => (greeted = !greeted)}>
        Hello world <!-- ${greeted} -->
      </ContextmenuEntry>
      <ContextmenuEntry run={() => (greeted_icon_snippet = !greeted_icon_snippet)}>
        {#snippet icon()}🌞{/snippet}
        Hello with an optional icon snippet <!-- ${greeted_icon_snippet} -->
      </ContextmenuEntry>
      <ContextmenuEntry run={() => (greeted_icon_string = !greeted_icon_string)} icon="🌚">
        Hello with an optional icon string <!-- ${greeted_icon_string} -->
      </ContextmenuEntry>
    {/snippet}
    ...markup with the above contextmenu behavior...
  </Contextmenu>
  ...markup with only default contextmenu behavior...
</${root_component_name}>
...markup without contextmenu behavior...`}
				/>
				<div><code class:color_g_50={greeted}>greeted = {greeted}</code></div>
				<div>
					<code class:color_e_50={greeted_icon_snippet}>
						greeted_icon_snippet = {greeted_icon_snippet}
					</code>
				</div>
				<div>
					<code class:color_d_50={greeted_icon_string}>
						greeted_icon_string = {greeted_icon_string}
					</code>
				</div>
				<aside class="mt_lg">
					The <code>scoped</code> prop is only needed when mounting a contextmenu inside a specific
					element instead of the entire page.
				</aside>
			</div>
		</Contextmenu>
	</TomeSection>
</ContextmenuRootComponent>
