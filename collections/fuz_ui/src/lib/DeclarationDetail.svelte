<!--
@component

Renders the full detail view for an exported declaration.
Handles all svelte-docinfo declaration kinds (function, class, interface,
type, variable, enum, component, snippet) and their kind-specific fields
including parameters, props, members, overloads, external types, and more.

@see `declaration.svelte.ts` for the `Declaration` wrapper class
@see {@link https://github.com/fuzdev/svelte-docinfo svelte-docinfo} for the analysis library
-->
<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import Mdz from '@fuzdev/mdz/Mdz.svelte';
	import { mdz_from_tsdoc } from '@fuzdev/mdz/tsdoc_mdz.ts';
	import {
		mdz_code_context,
		mdz_codeblock_context,
		mdz_set_context_with_fallback
	} from '@fuzdev/mdz/mdz_contexts.ts';
	import type { ParameterJsonInput } from 'svelte-docinfo/types.js';

	import type { Declaration } from './declaration.svelte.ts';
	import TypeLink from './TypeLink.svelte';
	import TypeJsonView from './TypeJsonView.svelte';
	import ModuleLink from './ModuleLink.svelte';
	import DocsLink from './DocsLink.svelte';

	const { declaration }: { declaration: Declaration } = $props();

	// external types not already shown in the inheritance section — on direct
	// heritage (`interface Props extends HTMLButtonAttributes`) the producer
	// deliberately records the same name in both fields, so the external-types
	// section keeps only what heritage doesn't already display
	const external_types_not_inherited = $derived.by(() => {
		const external_types = declaration.external_types;
		if (!external_types?.length) return undefined;
		const heritage = (declaration.extends_types ?? []).concat(declaration.implements_types ?? []);
		const filtered = external_types.filter((t) => !heritage.includes(t));
		return filtered.length ? filtered : undefined;
	});

	// render mdz inline `code` as API-linking `DocsLink` and fenced blocks as syntax-highlighted
	// `Code`, matching the rest of the docs — the injection mdz core leaves open
	mdz_set_context_with_fallback(mdz_code_context, () => DocsLink);
	mdz_set_context_with_fallback(mdz_codeblock_context, () => Code);

	// Optional prose metadata shared by component props and nested members,
	// rendered in a compact form (the top-level declaration uses prominent
	// sections for the same fields instead).
	interface DocExtras {
		deprecatedMessage?: string;
		internalMessage?: string;
		since?: string;
		examples?: Array<string>;
		seeAlso?: Array<string>;
		throws?: Array<{ type?: string; description: string }>;
	}
</script>

<!-- A single function/method parameter: name, description, type, and optional/default. -->
{#snippet param_detail(param: ParameterJsonInput)}
	<section>
		<h4>
			<code>
				{param.name}{#if param.optional}<strong>?</strong>{/if}
			</code>
		</h4>
		{#if param.description}
			<Mdz content={param.description} />
		{/if}
		<div class="row gap_md mb_sm">
			<strong>type</strong>
			<TypeLink type={param.type} type_info={param.typeInfo} />
		</div>
		{#if param.optional || param.defaultValue}
			<div class="row gap_md">
				{#if param.optional}
					<strong>optional</strong>
				{/if}
				{#if param.defaultValue}
					<strong>default</strong>
					<Code lang="ts" content={param.defaultValue} />
				{/if}
			</div>
		{/if}
	</section>
{/snippet}

<!-- A compact parameter row: name (with optional marker) and type, for snippet params and overloads. -->
{#snippet param_row(param: ParameterJsonInput)}
	<div class="row gap_md">
		<code>
			{param.name}{#if param.optional}?{/if}
		</code>
		<TypeLink type={param.type} type_info={param.typeInfo} />
	</div>
{/snippet}

<!-- Compact prose metadata for props and members (deprecated, internal, since, examples, see also, throws). -->
{#snippet doc_extras(item: DocExtras)}
	<!-- eslint-disable-next-line @typescript-eslint/no-deprecated -->
	{#if item.deprecatedMessage !== undefined}
		<p class="row gap_md">
			<span class="chip">⚠️ deprecated</span>
			<!-- eslint-disable-next-line @typescript-eslint/no-deprecated -->
			{#if item.deprecatedMessage}{item.deprecatedMessage}{/if}
		</p>
	{/if}
	{#if item.internalMessage !== undefined}
		<p class="row gap_md">
			<span class="chip">internal</span>
			{#if item.internalMessage}{item.internalMessage}{/if}
		</p>
	{/if}
	{#if item.since}
		<p><strong>since</strong> {item.since}</p>
	{/if}
	{#if item.examples?.length}
		{#each item.examples as example (example)}
			<Mdz content={example} />
		{/each}
	{/if}
	{#if item.seeAlso?.length}
		<p><strong>see also</strong></p>
		<ul>
			{#each item.seeAlso as ref (ref)}
				<li><Mdz content={mdz_from_tsdoc(ref)} /></li>
			{/each}
		</ul>
	{/if}
	{#if item.throws?.length}
		<p><strong>throws</strong></p>
		<ul>
			{#each item.throws as thrown (thrown)}
				<li>
					{#if thrown.type}
						<code>{thrown.type}</code> - {thrown.description}
					{:else}
						{thrown.description}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<!-- A comma-separated inline list of type links (extends, implements, external types are rarely more than one). -->
{#snippet type_list(types: Array<string>)}
	{#each types as type, i (type)}
		{#if i > 0}
			,
		{/if}<TypeLink {type} />
	{/each}
{/snippet}

<!-- Metadata -->
<p class="row justify-content:space-between">
	<ModuleLink module_path={declaration.module_path} />
	{#if declaration.url_github}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="chip" href={declaration.url_github} target="_blank" rel="noopener">view source</a>
	{/if}
</p>

<!-- chips -->
<!-- eslint-disable-next-line @typescript-eslint/no-deprecated -->
{#if declaration.is_deprecated ||
	declaration.is_internal ||
	declaration.reactivity ||
	declaration.accepts_children ||
	declaration.merged_value ||
	declaration.alias_of
}
	<p class="row gap_md flex-wrap:wrap">
		<!-- eslint-disable-next-line @typescript-eslint/no-deprecated -->
		{#if declaration.is_deprecated}
			<span class="chip">⚠️ deprecated</span>
		{/if}
		{#if declaration.is_internal}
			<span class="chip">internal</span>
		{/if}
		{#if declaration.reactivity}
			<span class="chip">{declaration.reactivity}</span>
		{/if}
		{#if declaration.accepts_children}
			<span class="chip">accepts children</span>
		{/if}
		{#if declaration.merged_value}
			<span class="chip">value + type</span>
		{/if}
		{#if declaration.alias_of}
			<span class="chip">
				alias of {declaration.alias_of.name}{#if declaration.alias_of.module}
					in {declaration.alias_of.module}
				{/if}
			</span>
		{/if}
	</p>
{/if}

<!-- also exported from -->
{#if declaration.also_exported_from?.length}
	<p class="row gap_md flex-wrap:wrap">
		<strong>also exported from</strong>
		{#each declaration.also_exported_from as module_path (module_path)}
			<ModuleLink {module_path} />
		{/each}
	</p>
{/if}

<!-- eslint-disable-next-line @typescript-eslint/no-deprecated -->
{#if declaration.deprecated_message}
	<p>
		<!-- eslint-disable-next-line @typescript-eslint/no-deprecated -->
		{declaration.deprecated_message}
	</p>
{/if}

{#if declaration.internal_message}
	<p>{declaration.internal_message}</p>
{/if}

<!-- type signature -->
{#if declaration.type_signature}
	<Code lang="ts" content={declaration.type_signature} />
{/if}

<!-- structured type (variables and type aliases; carries what the flat
	signature lost — union members, recovered alias names — with links);
	`type_info_expanded` strips a self-aliased root so a union alias expands
	into its members here instead of linking circularly to itself -->
{#if declaration.type_info_expanded}
	<p class="row gap_md">
		<strong>type</strong>
		<TypeJsonView type_info={declaration.type_info_expanded} title={declaration.type_signature} />
	</p>
{/if}

<!-- default (top-level variables; params, props, and members render theirs inline) -->
{#if declaration.default_value}
	<p class="row gap_md">
		<strong>default</strong>
		<Code lang="ts" content={declaration.default_value} />
	</p>
{/if}

<!-- import statement -->
<Code lang="ts" content={declaration.import_statement} />

<!-- documentation -->
{#if declaration.has_documentation}
	<Mdz content={declaration.doc_comment!} />
{/if}

<!-- parameters -->
{#if declaration.parameters?.length}
	<section>
		{#each declaration.parameters as param (param)}
			{@render param_detail(param)}
		{/each}
	</section>
{/if}

<!-- component props (for Svelte components) -->
{#if declaration.props?.length}
	<section>
		{#each declaration.props as prop (prop)}
			<section>
				<h4>
					<code>
						{prop.name}{#if prop.optional}<strong>?</strong>{/if}
					</code>
				</h4>
				{#if prop.description}
					<Mdz content={prop.description} />
				{/if}
				<div class="row gap_md mb_sm">
					<strong>type</strong>
					<TypeLink type={prop.type} type_info={prop.typeInfo} />
				</div>
				{#if prop.optional || prop.bindable || prop.defaultValue}
					<div class="row gap_md">
						{#if prop.optional}
							<strong>optional</strong>
						{/if}
						{#if prop.bindable}
							<strong>bindable</strong>
						{/if}
						{#if prop.defaultValue}
							<strong>default</strong>
							<Code lang="ts" content={prop.defaultValue} />
						{/if}
					</div>
				{/if}
				{#if prop.parameters?.length}
					<section>
						<h5>snippet parameters</h5>
						{#each prop.parameters as param (param)}
							{@render param_row(param)}
						{/each}
					</section>
				{/if}
				{@render doc_extras(prop)}
			</section>
		{/each}
	</section>
{/if}

<!-- overloads -->
{#if declaration.overloads?.length}
	<section>
		<h4>overloads</h4>
		{#each declaration.overloads as overload, i (i)}
			<section>
				<Code lang="ts" content={overload.typeSignature} />
				{#if overload.docComment}
					<Mdz content={overload.docComment} />
				{/if}
				{#if overload.parameters?.length}
					{#each overload.parameters as param (param)}
						{@render param_row(param)}
					{/each}
				{/if}
				{#if overload.returnType}
					<div class="row gap_md">
						<strong>returns</strong>
						<TypeLink type={overload.returnType} type_info={overload.returnTypeInfo} />
					</div>
					{#if overload.returnDescription}
						<Mdz content={overload.returnDescription} />
					{/if}
				{/if}
			</section>
		{/each}
	</section>
{/if}

<!-- external types whose contributions are filtered out of (or, on
	interfaces/classes, never enumerated in) props/members -->
{#if external_types_not_inherited}
	<section>
		<h4>external types</h4>
		<div class="row gap_md flex-wrap:wrap">
			{@render type_list(external_types_not_inherited)}
		</div>
	</section>
{/if}

<!-- returns -->
{#if declaration.return_type}
	<section>
		<h4>returns</h4>
		{#if declaration.return_type_info}
			<!-- the flat expansion stays visible in the type signature above -->
			<p>
				<TypeJsonView type_info={declaration.return_type_info} title={declaration.return_type} />
			</p>
		{:else}
			<Code lang="ts" content={declaration.return_type} />
		{/if}
		{#if declaration.return_description}
			<Mdz content={declaration.return_description} />
		{/if}
	</section>
{/if}

<!-- generics -->
{#if declaration.generic_params.length}
	<section>
		<div class="row gap_md">
			<h4>generics</h4>
			<TypeLink type={declaration.display_name} />
		</div>
		{#each declaration.generic_params as generic (generic)}
			<section>
				<h5><code>{generic.name}</code></h5>
				{#if generic.constraint}
					<div class="row gap_md">
						<strong>constraint</strong>
						<TypeLink type={generic.constraint} />
					</div>
				{/if}
				{#if generic.defaultType}
					<div class="row gap_md">
						<strong>default</strong>
						<TypeLink type={generic.defaultType} />
					</div>
				{/if}
			</section>
		{/each}
	</section>
{/if}

<!-- Extends/Implements -->
{#if declaration.extends_types?.length || declaration.implements_types?.length}
	<section>
		<h4>inheritance</h4>
		{#if declaration.extends_types?.length}
			<div class="row gap_md flex-wrap:wrap">
				<strong>extends:</strong>
				{@render type_list(declaration.extends_types)}
			</div>
		{/if}
		{#if declaration.implements_types?.length}
			<div class="row gap_md flex-wrap:wrap">
				<strong>implements:</strong>
				{@render type_list(declaration.implements_types)}
			</div>
		{/if}
	</section>
{/if}

<!-- throws -->
{#if declaration.throws.length}
	<section>
		<h4>throws</h4>
		<ul>
			{#each declaration.throws as thrown (thrown)}
				<li>
					{#if thrown.type}
						<code>{thrown.type}</code> - {thrown.description}
					{:else}
						{thrown.description}
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<!-- mutates -->
{#if declaration.mutates && Object.keys(declaration.mutates).length}
	<section>
		<h4>mutates</h4>
		<ul>
			{#each Object.entries(declaration.mutates) as [param, description] (param)}
				<li><code>{param}</code> — {description}</li>
			{/each}
		</ul>
	</section>
{/if}

<!-- since -->
{#if declaration.since}
	<section>
		<h4>since</h4>
		<p>{declaration.since}</p>
	</section>
{/if}

<!-- examples -->
{#if declaration.examples.length}
	<section>
		<h4>examples</h4>
		{#each declaration.examples as example (example)}
			<Mdz content={example} />
		{/each}
	</section>
{/if}

<!-- see also -->
{#if declaration.see_also.length}
	<section>
		<h4>see also</h4>
		<ul>
			{#each declaration.see_also as ref (ref)}
				<li>
					<Mdz content={mdz_from_tsdoc(ref)} />
				</li>
			{/each}
		</ul>
	</section>
{/if}

<!-- members (classes, interfaces, types, enums) -->
{#if declaration.members?.length}
	<section>
		{#each declaration.members as member (member)}
			<section>
				<h4>
					<code>
						{member.name}{#if member.kind !== 'constructor' && member.optional}
							<strong>?</strong>
						{/if}
					</code>
				</h4>
				{#if member.docComment}
					<Mdz content={member.docComment} />
				{/if}
				{#if member.typeSignature}
					<p class="row gap_md">
						<strong>type</strong>
						<TypeLink
							type={member.kind === 'constructor'
								? `new ${member.typeSignature}`
								: member.typeSignature}
							type_info={member.kind === 'variable' ? member.typeInfo : undefined}
						/>
					</p>
				{/if}
				{#if member.modifiers?.length || (member.kind === 'variable' && member.reactivity)}
					<div class="row gap_md flex-wrap:wrap">
						{#if member.modifiers?.length}
							{#each member.modifiers as modifier (modifier)}
								<span class="chip">{modifier}</span>
							{/each}
						{/if}
						{#if member.kind === 'variable' && member.reactivity}
							<span class="chip">{member.reactivity}</span>
						{/if}
					</div>
				{/if}
				{#if (member.kind === 'variable' || member.kind === 'function') && member.defaultValue}
					<div class="row gap_md">
						<strong>default</strong>
						<Code lang="ts" content={member.defaultValue} />
					</div>
				{/if}
				<!-- parameters for methods and constructors -->
				{#if (member.kind === 'function' || member.kind === 'constructor') &&
					member.parameters?.length
				}
					<section>
						{#each member.parameters as param (param)}
							{@render param_detail(param)}
						{/each}
					</section>
				{/if}
				<!-- return type for methods -->
				{#if member.kind === 'function' && member.returnType}
					<div class="row gap_md">
						<strong>returns</strong>
						<TypeLink type={member.returnType} type_info={member.returnTypeInfo} />
					</div>
					{#if member.returnDescription}
						<Mdz content={member.returnDescription} />
					{/if}
				{/if}
				{@render doc_extras(member)}
			</section>
		{/each}
	</section>
{/if}

<style>
	section section:not(:last-child) {
		margin-bottom: var(--space_xl4);
	}
</style>
