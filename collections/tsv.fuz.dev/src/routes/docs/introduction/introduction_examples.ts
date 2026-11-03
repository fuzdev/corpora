// The introduction's code samples. Kept in a `.ts` module so the `</script>` in the
// Svelte strings reads literally — inside a `.svelte` file's script block it would
// close the block, and the `<\/script>` escape it needs there would show on the page.

export const usage_example = `import { format_svelte, parse_svelte, strip_typescript, type Root } from '@fuzdev/tsv';

const formatted = format_svelte('<script>\\nconst   x=1\\n</script>');
if (formatted.ok) console.log(formatted.code);

const parsed = parse_svelte('<script>const x = 1;</script>');
if (!parsed.ok) throw new Error(parsed.error.message);
const ast: Root = parsed.ast;

const stripped = strip_typescript('let x: number = 1;');`;

export const format_example = `import { format_svelte } from '@fuzdev/tsv-format-wasm';

const formatted = format_svelte('<script>\\nconst   x=1\\n</script>');`;

export const parse_example = `import { parse_svelte } from '@fuzdev/tsv-parse-wasm';

const parsed = parse_svelte('<script>const x = 1;</script>');`;

export const error_example = `import { format_typescript } from '@fuzdev/tsv';

const result = format_typescript('let a;\\nconst = ;');
if (!result.ok) {
	result.error.kind; // 'parse'
	result.error.message; // "Expected identifier or destructuring pattern, found '='"
	result.error.frame; // '2:7 const = ;\\n          ^ here'
	result.error.loc.start; // {line: 2, column: 6}
}`;

export const strip_example = `import { strip_typescript } from '@fuzdev/tsv';

const result = strip_typescript('let x: number = 1;');
if (result.ok) {
	result.code; // 'let x         = 1;'
} else {
	result.error.kind; // 'parse' or 'unsupported'
}`;

export const locations_example = `import { parse_typescript, create_locator } from '@fuzdev/tsv-parse-wasm';

const source = 'const x = 1;';

// the default AST is span-only: start/end offsets, no per-node loc
const parsed = parse_typescript(source);

// loc on every node, the tree acorn's \`locations: true\` returns
const located = parse_typescript(source, { locations: true });

// or look up only the positions you need, over one line table
const locator = create_locator(source, { language: 'typescript' });
if (parsed.ok) {
	const [declaration] = parsed.ast.body;
	locator.position_at(declaration.start); // {line: 1, column: 0}
	locator.loc_of(declaration); // {start: {line, column}, end: {line, column}}
}`;
