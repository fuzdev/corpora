import type { Library } from '$lib/library.svelte.ts';

/**
 * A minimal fake `Library` for mounting docs components in tests:
 * `TypeJsonView`/`TypeLink` read only `declaration_by_name` and, for
 * module-scoped tokens, `module_by_path`; `DeclarationLink` reads the
 * resolved declaration's `url_api`/`url_github`.
 *
 * @param names - declarations resolvable library-wide, homed in `x.ts`
 * @param modules - declarations resolvable only through their module's path
 */
export const fake_library = (
	names: Array<string> = [],
	modules: Record<string, Array<string>> = {}
): Library => {
	const to_declaration = (name: string, module_path: string) => ({
		url_api: `/docs/api/${module_path}#${name}`,
		url_github: undefined
	});
	return {
		declaration_by_name: new Map(names.map((name) => [name, to_declaration(name, 'x.ts')])),
		module_by_path: new Map(
			Object.entries(modules).map(([path, module_names]) => [
				path,
				{
					get_declaration_by_name: (name: string) =>
						module_names.includes(name) ? to_declaration(name, path) : undefined
				}
			])
		)
	} as unknown as Library;
};
