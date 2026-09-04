<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import { slide } from 'svelte/transition';
	import { swallow } from '@fuzdev/fuz_util/dom.ts';

	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import ContextmenuSubmenu from '$lib/ContextmenuSubmenu.svelte';
	import Contextmenu from '$lib/Contextmenu.svelte';
	import { ContextmenuState } from '$lib/contextmenu_state.svelte.ts';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import Glyph from '$lib/Glyph.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	const selected = selected_contextmenu_root_component_context.get();
	const ContextmenuRootComponent = $derived(selected.component);
	const root_component_name = $derived(selected.name);

	const contextmenu = new ContextmenuState();

	let selected_color: 'f' | 'g' | 'j' | undefined = $state.raw();

	// @fuz-classes color_f_50 color_g_50 color_j_50 color_f color_g color_j
	const selected_color_class = $derived(selected_color ? `color_${selected_color}_50` : undefined);
	const selected_hue_class = $derived(selected_color ? `color_${selected_color}` : undefined);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<ContextmenuRootComponent {contextmenu} scoped>
	<TomeSection>
		<TomeSectionHeader text="Custom instance" />
		<Contextmenu>
			{#snippet entries()}
				<ContextmenuSubmenu icon="🎨">
					select color
					{#snippet menu()}
						<ContextmenuEntry
							run={() => {
								selected_color = 'f';
								return { ok: true, close: false };
							}}
						>
							<span class="color_f_50">option f</span>
						</ContextmenuEntry>
						<ContextmenuEntry
							run={() => {
								selected_color = 'g';
								return { ok: true, close: false };
							}}
						>
							<span class="color_g_50">option g</span>
						</ContextmenuEntry>
						<ContextmenuEntry
							run={() => {
								selected_color = 'j';
								return { ok: true, close: false };
							}}
						>
							<span class="color_j_50">option j</span>
						</ContextmenuEntry>
						<ContextmenuEntry
							run={() => {
								contextmenu.close();
								return { ok: true };
							}}
						>
							close contextmenu
						</ContextmenuEntry>
					{/snippet}
				</ContextmenuSubmenu>
			{/snippet}
			<div class="panel p_md">
				<p class="mb_md">
					The <code>{root_component_name}</code> prop <code>contextmenu</code> accepts a custom
					<code>ContextmenuState</code>
					instance, allowing you to observe its reactive state and control it programmatically.
				</p>
				<Code lang="ts" content={`const contextmenu = new ContextmenuState();`} />
				<Code
					content={`<${root_component_name} {contextmenu} scoped>...</${root_component_name}>`}
				/>
				<p class="mb_md">
					Try opening the contextmenu on this panel, then use the navigation buttons below to cycle
					through entries -- just like the arrow keys. The color entries return
					<code>{'{ok: true, close: false}'}</code>
					to keep the menu open after activation, allowing you to select multiple colors using the
					activate button (↵).
				</p>
				<div class="mb_md {selected_color_class}">
					<p>Reactive state:</p>
					<ul>
						<li><code>contextmenu.opened</code> === <code>{contextmenu.opened}</code></li>
						<li>
							<code>contextmenu.x</code> ===
							<code>{contextmenu.x} && contextmenu.y === {contextmenu.y}</code>
						</li>
						{#if contextmenu.error}
							<li class="color_c_50">Error: <code>{contextmenu.error}</code></li>
						{/if}
					</ul>
				</div>
				{#if contextmenu.opened}
					<div class="display:flex" transition:slide>
						<div class="box">
							<button
								type="button"
								class="border_bottom_left_radius_0 border_bottom_right_radius_0 {selected_hue_class}"
								disabled={!contextmenu.can_select_sibling}
								onmousedowncapture={(e) => {
									swallow(e);
									contextmenu.select_previous();
								}}
							>
								<Glyph glyph="↑" />
							</button>
							<div class="row">
								<button
									type="button"
									class="border_bottom_right_radius_0 border_top_right_radius_0 {selected_hue_class}"
									disabled={!contextmenu.can_collapse}
									onmousedowncapture={(e) => {
										swallow(e);
										contextmenu.collapse_selected();
									}}
								>
									<Glyph glyph="←" />
								</button>
								<button
									type="button"
									class="border-radius:0 {selected_hue_class}"
									disabled={!contextmenu.can_activate}
									onmousedowncapture={async (e) => {
										swallow(e);
										await contextmenu.activate_selected();
									}}
								>
									<Glyph glyph="↵" />
								</button>
								<button
									type="button"
									class="border_bottom_left_radius_0 border_top_left_radius_0 {selected_hue_class}"
									disabled={!contextmenu.can_expand}
									onmousedowncapture={(e) => {
										swallow(e);
										contextmenu.expand_selected();
									}}
								>
									<Glyph glyph="→" />
								</button>
							</div>
							<button
								type="button"
								class="border_top_left_radius_0 border_top_right_radius_0 {selected_hue_class}"
								disabled={!contextmenu.can_select_sibling}
								onmousedowncapture={(e) => {
									swallow(e);
									contextmenu.select_next();
								}}
							>
								<Glyph glyph="↓" />
							</button>
						</div>
					</div>
				{/if}
			</div>
		</Contextmenu>
	</TomeSection>
</ContextmenuRootComponent>
