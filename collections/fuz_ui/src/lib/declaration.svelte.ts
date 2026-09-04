import type {
	DeclarationJson,
	DeclarationJsonInput,
	MemberJsonInput,
	ParameterJsonInput,
	ComponentPropJsonInput,
	OverloadJsonInput,
	Reactivity,
	TypeJson
} from 'svelte-docinfo/types.js';
import { generateImport, getDisplayName } from 'svelte-docinfo/declaration-helpers.js';
import { EMPTY_ARRAY } from '@fuzdev/fuz_util/array.ts';

import type { Module } from './module.svelte.ts';
import { url_github_file } from '@fuzdev/fuz_util/package_helpers.ts';

// The `virtual:svelte-docinfo` module is serialized with svelte-docinfo's
// `compactReplacer`, which strips empty default arrays — so the runtime data
// is the `*Input` shape (defaulted arrays optional), not the parsed `*Json`
// shape. Typing it as input makes TypeScript force a guard on every
// defaulted-array read.
//
// Helper to access kind-specific fields on the discriminated union.
// At runtime the field is present or undefined; TypeScript needs the cast.
const field = <T>(decl: DeclarationJsonInput, key: string): T | undefined =>
	(decl as Record<string, unknown>)[key] as T | undefined;

/**
 * Rich runtime representation of an exported declaration.
 *
 * Wraps svelte-docinfo's `DeclarationJson` discriminated union (on `kind`)
 * with computed properties and URLs. Kind-specific fields are accessed via
 * the `field()` helper since not all fields exist on all variants.
 *
 * Computed properties are plain getters rather than `$derived` — see
 * `Library` for why.
 *
 * @see {@link https://github.com/fuzdev/svelte-docinfo svelte-docinfo} for the analysis library
 * @see `DeclarationDetail.svelte` for the rendering component
 */
export class Declaration {
	readonly module: Module = $state.raw()!;
	readonly declaration_json: DeclarationJsonInput = $state.raw()!;

	get library(): Module['library'] {
		return this.module.library;
	}

	/**
	 * Module path where this declaration is defined.
	 */
	get module_path(): string {
		return this.module.path;
	}

	get name(): string {
		return this.declaration_json.name;
	}

	get kind(): DeclarationJsonInput['kind'] {
		return this.declaration_json.kind;
	}

	/**
	 * GitHub source URL with line number.
	 */
	get url_github(): string | undefined {
		return this.library.repo_url && this.declaration_json.sourceLine
			? url_github_file(
					this.library.repo_url,
					`src/lib/${this.module_path}`,
					this.declaration_json.sourceLine
				)
			: undefined;
	}

	/**
	 * API documentation URL.
	 */
	get url_api(): string {
		return `/docs/api${this.library.url_prefix}/${this.module_path}#${this.name}`;
	}

	#import_statement: string | undefined;

	/**
	 * Generated TypeScript import statement.
	 */
	get import_statement(): string {
		// `generateImport` reads only `name`/`kind`/`mergedValue`/path, none of
		// the defaulted arrays, and treats an absent `mergedValue` as the stripped
		// `false`, so asserting the parsed shape here is sound.
		return (this.#import_statement ??= generateImport(
			this.declaration_json as DeclarationJson,
			this.module_path,
			this.library.pkg_json.name
		));
	}

	/**
	 * Public documentation link (if homepage_url is available).
	 */
	get url_api_full(): string | undefined {
		return this.library.homepage_url
			? `${this.library.homepage_url.replace(/\/$/, '')}/docs/api/${this.module_path}#${this.name}`
			: undefined;
	}

	#display_name: string | undefined;

	/**
	 * Display name with generic parameters.
	 */
	get display_name(): string {
		// `getDisplayName` reads `genericParams` unguarded, so feed it the defaulted
		// value rather than the raw (possibly-absent) input field.
		return (this.#display_name ??= getDisplayName({
			...this.declaration_json,
			genericParams: this.declaration_json.genericParams ?? []
		} as DeclarationJson));
	}

	get type_signature(): string | undefined {
		return this.declaration_json.typeSignature;
	}

	/**
	 * Structured type tree beside `type_signature`, absent when the flat string
	 * is the whole story. Present on `variable` and `type` kinds only.
	 */
	get type_info(): TypeJson | undefined {
		return field<TypeJson>(this.declaration_json, 'typeInfo');
	}

	/**
	 * `type_info` prepared for rendering at the declaration itself. A type
	 * alias's tree carries the alias's own name at the root
	 * (`type A = 'a' | 'b'` → `{kind: 'union', alias: 'A', members: [...]}`),
	 * which `typeJsonToTokens` collapses to the bare name — right where `A` is
	 * composed into another type, circular at `A`'s own declaration. Strips
	 * that self-alias so the root expands into its members; every other tree
	 * passes through unchanged.
	 */
	get type_info_expanded(): TypeJson | undefined {
		const type_info = this.type_info;
		if (
			type_info &&
			(type_info.kind === 'union' || type_info.kind === 'intersection') &&
			type_info.alias === this.name
		) {
			return { ...type_info, alias: undefined };
		}
		return type_info;
	}

	/**
	 * Default value documented via `@default`; the authoritative initializer
	 * (when human-readable) is in `type_signature`. Present on `variable` kind
	 * only — parameters, props, and members carry their own.
	 */
	get default_value(): string | undefined {
		return field<string>(this.declaration_json, 'defaultValue');
	}

	get doc_comment(): string | undefined {
		return this.declaration_json.docComment;
	}

	get deprecated_message(): string | undefined {
		return this.declaration_json.deprecatedMessage;
	}

	get parameters(): Array<ParameterJsonInput> | undefined {
		return field<Array<ParameterJsonInput>>(this.declaration_json, 'parameters');
	}

	get props(): Array<ComponentPropJsonInput> | undefined {
		return field<Array<ComponentPropJsonInput>>(this.declaration_json, 'props');
	}

	get return_type(): string | undefined {
		return field<string>(this.declaration_json, 'returnType');
	}

	/**
	 * Structured return type beside `return_type`, absent when the flat string
	 * is the whole story. Present on `function` kind only.
	 */
	get return_type_info(): TypeJson | undefined {
		return field<TypeJson>(this.declaration_json, 'returnTypeInfo');
	}

	get return_description(): string | undefined {
		return field<string>(this.declaration_json, 'returnDescription');
	}

	get generic_params(): NonNullable<DeclarationJsonInput['genericParams']> {
		return this.declaration_json.genericParams ?? EMPTY_ARRAY;
	}

	get extends_types(): Array<string> | undefined {
		return field<Array<string>>(this.declaration_json, 'extends');
	}

	get implements_types(): Array<string> | undefined {
		return field<Array<string>>(this.declaration_json, 'implements');
	}

	get throws(): NonNullable<DeclarationJsonInput['throws']> {
		return this.declaration_json.throws ?? EMPTY_ARRAY;
	}

	get since(): string | undefined {
		return this.declaration_json.since;
	}

	get examples(): NonNullable<DeclarationJsonInput['examples']> {
		return this.declaration_json.examples ?? EMPTY_ARRAY;
	}

	get see_also(): NonNullable<DeclarationJsonInput['seeAlso']> {
		return this.declaration_json.seeAlso ?? EMPTY_ARRAY;
	}

	/**
	 * Nested members for classes, interfaces, types, and enums.
	 */
	get members(): Array<MemberJsonInput> | undefined {
		return field<Array<MemberJsonInput>>(this.declaration_json, 'members');
	}

	/**
	 * External types whose contributions are filtered out of props/members —
	 * the attribute bags a component forwards, however the author composed
	 * them (intersection, heritage clause, bare or indexed-access reference).
	 * On `interface`/`class` kinds it records the external reach of the
	 * heritage chain, whose contributions members (own-only) never enumerate.
	 * Present on `component`, `type`, `interface`, and `class` kinds.
	 */
	get external_types(): Array<string> | undefined {
		return field<Array<string>>(this.declaration_json, 'externalTypes');
	}

	/**
	 * Whether the exported name also carries a value meaning — a merged
	 * value+type symbol like `const Foo = z.strictObject({...})` beside
	 * `type Foo = z.infer<typeof Foo>`, where the type wins the declaration slot.
	 * Present on `type` and `interface` kinds.
	 */
	get merged_value(): boolean | undefined {
		return field<boolean>(this.declaration_json, 'mergedValue');
	}

	/**
	 * Whether a component accepts children via props or template usage.
	 * Present on `component` kind only.
	 */
	get accepts_children(): boolean | undefined {
		return field<boolean>(this.declaration_json, 'acceptsChildren');
	}

	/**
	 * Function overload signatures when multiple public overloads exist.
	 * Present on `function` and `snippet` kinds, and on function/constructor members.
	 */
	get overloads(): Array<OverloadJsonInput> | undefined {
		return field<Array<OverloadJsonInput>>(this.declaration_json, 'overloads');
	}

	/**
	 * Re-export alias info when this declaration is a renamed re-export.
	 */
	get alias_of(): DeclarationJsonInput['aliasOf'] {
		return this.declaration_json.aliasOf;
	}

	/**
	 * Other modules that also export this declaration (re-export paths
	 * relative to src/lib). Absent when only exported from its defining module.
	 * The back-link of those modules' `Module.re_exports` edges.
	 */
	get also_exported_from(): DeclarationJsonInput['alsoExportedFrom'] {
		return this.declaration_json.alsoExportedFrom;
	}

	/**
	 * Mutation documentation from `@mutates` tags, mapping parameter names to descriptions.
	 */
	get mutates(): DeclarationJsonInput['mutates'] {
		return this.declaration_json.mutates;
	}

	/**
	 * Internal-API marker from the `@internal` tag. Presence means the tag was
	 * written; an empty string is a bare tag with no trailing prose. A marker,
	 * not an exclusion — the declaration stays documented.
	 */
	get internal_message(): string | undefined {
		return this.declaration_json.internalMessage;
	}

	/**
	 * Svelte reactivity flavor (`$state`, `$state.raw`, `$derived`, `$derived.by`)
	 * when this variable is initialized with a value-producing rune.
	 * Present on `variable` kind only.
	 */
	get reactivity(): Reactivity | undefined {
		return field<Reactivity>(this.declaration_json, 'reactivity');
	}

	get has_examples(): boolean {
		return this.examples.length > 0;
	}

	// presence, not truthiness — a bare `@deprecated` (no message text) arrives as `''`
	get is_deprecated(): boolean {
		return this.deprecated_message !== undefined;
	}

	// presence, not truthiness — a bare `@internal` (no message text) arrives as `''`
	get is_internal(): boolean {
		return this.internal_message !== undefined;
	}

	get has_documentation(): boolean {
		return !!this.doc_comment;
	}

	get has_parameters(): boolean {
		const { parameters } = this;
		return !!(parameters && parameters.length > 0);
	}

	get has_props(): boolean {
		const { props } = this;
		return !!(props && props.length > 0);
	}

	get has_generics(): boolean {
		return this.generic_params.length > 0;
	}

	constructor(module: Module, declaration_json: DeclarationJsonInput) {
		this.module = module;
		this.declaration_json = declaration_json;
	}
}
