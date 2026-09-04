<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import PendingAnimation from '$lib/PendingAnimation.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';

	const TOME_SLUG = 'PendingAnimation';
	const tome = tome_get_by_slug(TOME_SLUG);

	let turtle_slot = $state.raw('🐢');
	let turtle_slot_2a = $state.raw('🐸');
	let turtle_slot_2b = $state.raw('⏳');
	let running = $state.raw(true);
	let inline = $state.raw(true);

	// Formats boolean html attrs for display, using shorthand when true
	const to_boolean_attr = (name: 'running' | 'inline', value: boolean): string => {
		const default_value = name === 'running' ? true : name === 'inline' ? false : undefined;
		if (default_value === undefined) throw Error();
		if (default_value === value) return '';
		return value ? ' ' + name : ` ${name}={false}`;
	};
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<!-- TODO make this a generic data-driven helper -->
		<Code
			lang="ts"
			content={`import PendingAnimation from '@fuzdev/fuz_ui/PendingAnimation.svelte';`}
		/>
		<Code content={`<PendingAnimation${to_boolean_attr('running', running)} />`} />
		<PendingAnimation {running} />
		<button type="button" class="my_lg" onclick={() => (running = !running)}>
			{#if running}pause animation{:else}play animation{/if}
		</button>
		<p>
			The default animation has text children, so they scale with <code>font-size</code>.
		</p>
		<p>Set size with custom properties:</p>
		<Code
			content={`<PendingAnimation --font_size="var(--font_size_xl5)"${to_boolean_attr(
				'running',
				running
			)} />`}
		/>
		<div class="mb_lg align_items_flex_start" role="none">
			<PendingAnimation --font_size="var(--font_size_xl5)" {running} />
		</div>
		<p>Set size with classes:</p>
		<Code
			content={`<PendingAnimation attrs={{class: 'font_size_xl3'}}${to_boolean_attr(
				'running',
				running
			)} />`}
		/>
		<div class="align_items_flex_start" role="none">
			<PendingAnimation class="font_size_xl3" {running} />
		</div>
		<p>Size is inherited by default:</p>
		<Code
			content={`<div class="font_size_xl4"><PendingAnimation${to_boolean_attr(
				'running',
				running
			)} /></div>`}
		/>
		<div class="font_size_xl4 align_items_flex_start" role="none">
			<PendingAnimation {running} />
		</div>
	</section>

	<TomeSection>
		<TomeSectionHeader text="With inline">With <code>inline</code></TomeSectionHeader>
		<Code
			content={`<PendingAnimation${to_boolean_attr('inline', inline)}${to_boolean_attr(
				'running',
				running
			)} />`}
		/>
		<p>
			with
			<code>
				inline={'{'}<button type="button" onclick={() => (inline = !inline)}>{inline}</button>{'}'}
			</code>
			<PendingAnimation {inline} {running} />
		</p>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="With custom children" />
		<Code
			content={`<PendingAnimation --font_size="var(--font_size_xl6)"${to_boolean_attr(
				'running',
				running
			)}>
	{${turtle_slot}}
</PendingAnimation>`}
		/>
		<p>
			with children <input bind:value={turtle_slot} />
			<button type="button" onclick={() => (turtle_slot = '🐢🐢🐢')}>🐢🐢🐢</button>
			<button
				type="button"
				onclick={() => (turtle_slot = (turtle_slot + turtle_slot).substring(0, 24))}
			>
				* 2
			</button>
		</p>
		<PendingAnimation {running} --font_size="var(--font_size_xl6)">
			{turtle_slot}
		</PendingAnimation>
		<button type="button" onclick={() => (running = !running)}>
			{#if running}pause animation{:else}play animation{/if}
		</button>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="With children index prop">
			With children <code>index</code> prop
		</TomeSectionHeader>
		<Code
			content={`<PendingAnimation${to_boolean_attr('running', running)}>
	{#snippet children(index)}
		<div class="box">
			{${turtle_slot_2a}}
			{index}
			<span class="font_size_xl5">
				{${turtle_slot_2b}}
			</span>}
		</div>
	{/snippet}
</PendingAnimation>`}
		/>
		<p>
			with
			<code>
				running={'{'}<button type="button" onclick={() => (running = !running)}>
					{running}
				</button>{'}'}
			</code>
		</p>
		<p>
			and children <input bind:value={turtle_slot_2a} />
			<input bind:value={turtle_slot_2b} />
		</p>
		<PendingAnimation {running}>
			{#snippet children(index)}
				<div class="row">
					<span class="font_size_xl5">{turtle_slot_2a}</span>
					<span class="font_size_xl3">{index}</span>
					{turtle_slot_2b}
				</div>
			{/snippet}
		</PendingAnimation>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="With custom duration" />
		<Code
			content={`<PendingAnimation --animation_duration="var(--duration_6)" --font_size="var(--font_size_xl4)"${to_boolean_attr(
				'running',
				running
			)} />`}
		/>
		<PendingAnimation
			{running}
			--animation_duration="var(--duration_6)"
			--font_size="var(--font_size_xl4)"
		>
			{turtle_slot}
		</PendingAnimation>
		<button type="button" onclick={() => (running = !running)}>
			{#if running}pause animation{:else}play animation{/if}
		</button>
	</TomeSection>
</TomeContent>
