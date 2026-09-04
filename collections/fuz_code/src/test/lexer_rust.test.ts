import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import {
	Lexer,
	syntax_events_to_tokens,
	token_types_global,
	validate_syntax_events
} from '$lib/lexer.ts';
import { lexer_rust } from '$lib/lexer_rust.ts';

const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'rust')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

describe('lexer_rust', () => {
	test('resolves under both the rust id and the rs alias', () => {
		assert.ok(syntax_styler_global.has_lang('rust'));
		assert.ok(syntax_styler_global.has_lang('rs'));
	});

	test('keywords split into declaration and control-flow kinds', () => {
		assert.deepEqual(tokens_of('fn add(a: u32) -> u32 { return a; }'), [
			['keyword', 'fn'],
			['function', 'add'],
			['punctuation', '('],
			['punctuation', ':'],
			['builtin', 'u32'],
			['punctuation', ')'],
			['operator', '->'],
			['builtin', 'u32'],
			['punctuation', '{'],
			['special_keyword', 'return'],
			['punctuation', ';'],
			['punctuation', '}']
		]);
	});

	test('distinguishes lifetimes from char literals', () => {
		assert.deepEqual(tokens_of("&'a str"), [
			['operator', '&'],
			['lifetime', "'a"],
			['builtin', 'str']
		]);
		assert.deepEqual(tokens_of("'y'"), [['char', "'y'"]]);
		assert.deepEqual(tokens_of("&'static str"), [
			['operator', '&'],
			['lifetime', "'static"],
			['builtin', 'str']
		]);
	});

	test('loop labels lex as lifetimes', () => {
		assert.deepEqual(tokens_of("'outer: loop { break 'outer; }"), [
			['lifetime', "'outer"],
			['punctuation', ':'],
			['special_keyword', 'loop'],
			['punctuation', '{'],
			['special_keyword', 'break'],
			['lifetime', "'outer"],
			['punctuation', ';'],
			['punctuation', '}']
		]);
	});

	test('char escapes, unicode escapes, and astral chars', () => {
		assert.deepEqual(tokens_of("'\\n'"), [['char', "'\\n'"]]);
		assert.deepEqual(tokens_of("'\\''"), [['char', "'\\''"]]);
		assert.deepEqual(tokens_of("'\\u{1F600}'"), [['char', "'\\u{1F600}'"]]);
		assert.deepEqual(tokens_of("'😀'"), [['char', "'😀'"]]);
	});

	test('a stray quote stays plain text', () => {
		assert.deepEqual(tokens_of("' + 1"), [
			['operator', '+'],
			['number', '1']
		]);
	});

	test('lifetime renders with the symbol alias class', () => {
		assert.include(
			syntax_styler_global.stylize("'a", 'rust'),
			'<span class="token_lifetime token_symbol">'
		);
	});

	test('strings span lines and handle escapes', () => {
		assert.deepEqual(tokens_of('"line1\nline2" x'), [['string', '"line1\nline2"']]);
		assert.deepEqual(tokens_of('"a \\" b"'), [['string', '"a \\" b"']]);
		assert.deepEqual(tokens_of('"unterminated'), [['string', '"unterminated']]);
	});

	test('raw strings close on their hash count', () => {
		assert.deepEqual(tokens_of('r#"has "quotes" inside"#'), [
			['string', 'r#"has "quotes" inside"#']
		]);
		assert.deepEqual(tokens_of('r"plain\\raw"'), [['string', 'r"plain\\raw"']]);
		assert.deepEqual(tokens_of('r##"needs "# more"## x'), [['string', 'r##"needs "# more"##']]);
		assert.deepEqual(tokens_of('r#"unterminated'), [['string', 'r#"unterminated']]);
	});

	test('byte and c-string literals', () => {
		assert.deepEqual(tokens_of('b"bytes\\x00"'), [['string', 'b"bytes\\x00"']]);
		assert.deepEqual(tokens_of("b'x'"), [['char', "b'x'"]]);
		assert.deepEqual(tokens_of('br##"raw"##'), [['string', 'br##"raw"##']]);
		assert.deepEqual(tokens_of('c"hello"'), [['string', 'c"hello"']]);
		assert.deepEqual(tokens_of('cr#"raw"#'), [['string', 'cr#"raw"#']]);
	});

	test('raw identifiers are plain, never keywords', () => {
		assert.deepEqual(tokens_of('let r#type = 1;'), [
			['keyword', 'let'],
			['operator', '='],
			['number', '1'],
			['punctuation', ';']
		]);
	});

	test('macro invocations include the bang; != stays an operator', () => {
		assert.deepEqual(tokens_of('println!("hi")'), [
			['macro', 'println!'],
			['punctuation', '('],
			['string', '"hi"'],
			['punctuation', ')']
		]);
		assert.deepEqual(tokens_of('a != b'), [['operator', '!=']]);
	});

	test('macro renders with the function alias class', () => {
		assert.include(
			syntax_styler_global.stylize('vec![]', 'rust'),
			'<span class="token_macro token_function">vec!</span>'
		);
	});

	test('line comments split doc from plain', () => {
		assert.deepEqual(tokens_of('// plain'), [['comment', '// plain']]);
		assert.deepEqual(tokens_of('/// doc'), [['doc_comment', '/// doc']]);
		assert.deepEqual(tokens_of('//! inner doc'), [['doc_comment', '//! inner doc']]);
		assert.deepEqual(tokens_of('//// four slashes'), [['comment', '//// four slashes']]);
	});

	test('block comments nest', () => {
		assert.deepEqual(tokens_of('/* a /* nested */ b */ 1'), [
			['comment', '/* a /* nested */ b */'],
			['number', '1']
		]);
		assert.deepEqual(tokens_of('/* unterminated /* still'), [
			['comment', '/* unterminated /* still']
		]);
	});

	test('block doc comments split doc from plain', () => {
		assert.deepEqual(tokens_of('/** outer doc */'), [['doc_comment', '/** outer doc */']]);
		assert.deepEqual(tokens_of('/*! inner doc */'), [['doc_comment', '/*! inner doc */']]);
		assert.deepEqual(tokens_of('/**/'), [['comment', '/**/']]);
	});

	test('attribute interiors lex inline; strings/chars/comments hide their brackets', () => {
		// marker + leading path are attribute-styled; the arguments get normal rules
		assert.deepEqual(tokens_of('#[derive(Debug, Clone)]'), [
			['attribute', '#[derive'],
			['punctuation', '('],
			['capitalized_identifier', 'Debug'],
			['punctuation', ','],
			['capitalized_identifier', 'Clone'],
			['punctuation', ')'],
			['attribute', ']']
		]);
		// a path-only attribute coalesces back to a single token
		assert.deepEqual(tokens_of('#[inline]'), [['attribute', '#[inline]']]);
		assert.deepEqual(tokens_of('#![allow(dead_code)]'), [
			['attribute', '#![allow'],
			['punctuation', '('],
			['punctuation', ')'],
			['attribute', ']']
		]);
		// `::`-separated paths keep each segment attribute-styled
		assert.deepEqual(tokens_of('#[a::b]'), [
			['attribute', '#[a'],
			['punctuation', '::'],
			['attribute', 'b]']
		]);
		// a `]` inside a string, char, or comment must not close the attribute early
		assert.deepEqual(tokens_of('#[doc = "has ] bracket"]'), [
			['attribute', '#[doc'],
			['operator', '='],
			['string', '"has ] bracket"'],
			['attribute', ']']
		]);
		assert.deepEqual(tokens_of("#[foo(']')]"), [
			['attribute', '#[foo'],
			['punctuation', '('],
			['char', "']'"],
			['punctuation', ')'],
			['attribute', ']']
		]);
		assert.deepEqual(tokens_of('#[foo(/* ] */)]'), [
			['attribute', '#[foo'],
			['punctuation', '('],
			['comment', '/* ] */'],
			['punctuation', ')'],
			['attribute', ']']
		]);
		// a nested `[…]` is depth-counted, not an early close
		assert.deepEqual(tokens_of('#[foo[0]]'), [
			['attribute', '#[foo'],
			['punctuation', '['],
			['number', '0'],
			['punctuation', ']'],
			['attribute', ']']
		]);
		// an empty attribute stays contained — the naming context can't leak out
		assert.deepEqual(tokens_of('#[]\nfn a() {}'), [
			['attribute', '#[]'],
			['keyword', 'fn'],
			['function', 'a'],
			['punctuation', '()'],
			['punctuation', '{}']
		]);
		assert.deepEqual(tokens_of('#[unterminated'), [['attribute', '#[unterminated']]);
	});

	test('numbers with radices, separators, and suffixes', () => {
		assert.deepEqual(tokens_of('1_000u64'), [['number', '1_000u64']]);
		assert.deepEqual(tokens_of('0xFF_u8'), [['number', '0xFF_u8']]);
		assert.deepEqual(tokens_of('0b1010_1010'), [['number', '0b1010_1010']]);
		assert.deepEqual(tokens_of('0o777'), [['number', '0o777']]);
		assert.deepEqual(tokens_of('2.5e-3'), [['number', '2.5e-3']]);
	});

	test('ranges do not consume a trailing dot', () => {
		assert.deepEqual(tokens_of('0..10'), [
			['number', '0'],
			['operator', '..'],
			['number', '10']
		]);
		assert.deepEqual(tokens_of('1..=5'), [
			['number', '1'],
			['operator', '..='],
			['number', '5']
		]);
		assert.deepEqual(tokens_of('x.0'), [
			['punctuation', '.'],
			['number', '0']
		]);
	});

	test('turbofish calls lex as functions', () => {
		assert.deepEqual(tokens_of('iter.collect::<Vec<u8>>()'), [
			['punctuation', '.'],
			['function', 'collect'],
			['punctuation', '::'],
			['operator', '<'],
			['capitalized_identifier', 'Vec'],
			['operator', '<'],
			['builtin', 'u8'],
			['operator', '>>'],
			['punctuation', '()']
		]);
	});

	test('type-declaration keywords mark the next identifier as a type name', () => {
		assert.deepEqual(tokens_of('struct point;'), [
			['keyword', 'struct'],
			['class_name', 'point'],
			['punctuation', ';']
		]);
		assert.deepEqual(tokens_of('impl fmt::Display for MyType'), [
			['keyword', 'impl'],
			['punctuation', '::'],
			['class_name', 'Display'],
			['special_keyword', 'for'],
			['capitalized_identifier', 'MyType']
		]);
	});

	test('a naming keyword without a following name does not leak the context', () => {
		// `impl<T>` — the generic param is not a type name here, matching `fn id<T>`
		assert.deepEqual(tokens_of('impl<T> Foo for Bar {}'), [
			['keyword', 'impl'],
			['operator', '<'],
			['capitalized_identifier', 'T'],
			['operator', '>'],
			['capitalized_identifier', 'Foo'],
			['special_keyword', 'for'],
			['capitalized_identifier', 'Bar'],
			['punctuation', '{}']
		]);
		// a nameless `struct;` must not color the following identifier as a type
		assert.deepEqual(tokens_of('struct; foo'), [
			['keyword', 'struct'],
			['punctuation', ';']
		]);
	});

	test('try is a control-flow keyword', () => {
		assert.deepEqual(tokens_of('try { x }'), [
			['special_keyword', 'try'],
			['punctuation', '{'],
			['punctuation', '}']
		]);
	});

	test('union is a weak keyword', () => {
		assert.deepEqual(tokens_of('union MyUnion'), [
			['keyword', 'union'],
			['class_name', 'MyUnion']
		]);
		assert.deepEqual(tokens_of('foo.union(x)'), [
			['punctuation', '.'],
			['function', 'union'],
			['punctuation', '('],
			['punctuation', ')']
		]);
	});

	test('macro_rules! is a keyword and names the macro like a function', () => {
		assert.deepEqual(tokens_of('macro_rules! vec2 {}'), [
			['keyword', 'macro_rules!'],
			['function', 'vec2'],
			['punctuation', '{}']
		]);
	});

	test('screaming-case constants and single-letter generics', () => {
		assert.deepEqual(tokens_of('const MAX_SIZE: usize = 10;'), [
			['keyword', 'const'],
			['constant', 'MAX_SIZE'],
			['punctuation', ':'],
			['builtin', 'usize'],
			['operator', '='],
			['number', '10'],
			['punctuation', ';']
		]);
		assert.deepEqual(tokens_of('fn id<T>(x: T) -> T'), [
			['keyword', 'fn'],
			['function', 'id'],
			['operator', '<'],
			['capitalized_identifier', 'T'],
			['operator', '>'],
			['punctuation', '('],
			['punctuation', ':'],
			['capitalized_identifier', 'T'],
			['punctuation', ')'],
			['operator', '->'],
			['capitalized_identifier', 'T']
		]);
	});

	test('shebang at the document start', () => {
		assert.deepEqual(tokens_of('#!/usr/bin/env cargo\nfn main() {}'), [
			['hashbang', '#!/usr/bin/env cargo'],
			['keyword', 'fn'],
			['function', 'main'],
			['punctuation', '()'],
			['punctuation', '{}']
		]);
	});

	test('the try operator is punctuation-adjacent operator, not a char', () => {
		assert.deepEqual(tokens_of('let x = parse()?;'), [
			['keyword', 'let'],
			['operator', '='],
			['function', 'parse'],
			['punctuation', '()'],
			['operator', '?'],
			['punctuation', ';']
		]);
		assert.deepEqual(tokens_of('value?.field'), [
			['operator', '?'],
			['punctuation', '.']
		]);
	});

	test('where clauses keep their keyword and type bounds', () => {
		assert.deepEqual(tokens_of('where T: Clone + Send'), [
			['keyword', 'where'],
			['capitalized_identifier', 'T'],
			['punctuation', ':'],
			['capitalized_identifier', 'Clone'],
			['operator', '+'],
			['capitalized_identifier', 'Send']
		]);
	});

	test('fn-pointer types do not name the following value', () => {
		// `fn()` is a type, not a definition — `foo` is a value, not a function
		assert.deepEqual(tokens_of('let handler: fn() = foo;'), [
			['keyword', 'let'],
			['punctuation', ':'],
			['keyword', 'fn'],
			['punctuation', '()'],
			['operator', '='],
			['punctuation', ';']
		]);
		// `fn name` still names the definition
		assert.deepEqual(tokens_of('fn parse() {}'), [
			['keyword', 'fn'],
			['function', 'parse'],
			['punctuation', '()'],
			['punctuation', '{}']
		]);
	});

	test('postfix await is a keyword after a dot', () => {
		assert.deepEqual(tokens_of('fut.await'), [
			['punctuation', '.'],
			['special_keyword', 'await']
		]);
	});

	test('match arms and closures', () => {
		assert.deepEqual(tokens_of('match n { 1 => x, _ => y }'), [
			['special_keyword', 'match'],
			['punctuation', '{'],
			['number', '1'],
			['operator', '=>'],
			['punctuation', ','],
			['operator', '=>'],
			['punctuation', '}']
		]);
		assert.deepEqual(tokens_of('|a| a + 1'), [
			['operator', '|'],
			['operator', '|'],
			['operator', '+'],
			['number', '1']
		]);
	});

	test('capitalized identifiers get the class_name alias', () => {
		assert.include(
			syntax_styler_global.stylize('Some(1)', 'rust'),
			'<span class="token_capitalized_identifier token_class_name">Some</span>'
		);
	});
});

describe('lexer_rust embedding', () => {
	test('markdown fences embed rust', () => {
		const text = '```rust\nfn main() { println!("hi"); }\n```\n';
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(text, 'md')).map((t) => t.type)
		);
		assert.ok(types.has('lang_rust'), 'expected the fence lang container');
		assert.ok(types.has('keyword'), 'expected the embedded fn keyword');
		assert.ok(types.has('function'), 'expected the embedded function name');
		assert.ok(types.has('macro'), 'expected the embedded macro');
	});

	// lexes `text` with the window truncated to `window_end`, as `Lexer.embed`
	// does for fenced regions — no token may extend past the window
	const window_tokens = (text: string, window_end: number): Array<[string, number, number]> => {
		const lexer = new Lexer();
		lexer.text = text;
		lexer.pos = 0;
		lexer.end = window_end;
		lexer_rust.lex(lexer);
		const tokens = syntax_events_to_tokens({
			text,
			events: lexer.events,
			events_len: lexer.events_len,
			types: token_types_global
		});
		for (const t of tokens) {
			assert.isAtMost(t.end, window_end, `token ${t.type} extends past the window`);
		}
		return tokens.map((t) => [t.type, t.start, t.end]);
	};

	test('a `!` beyond the window cannot extend a macro span', () => {
		assert.deepEqual(window_tokens('foo!', 3), []);
	});

	test("a `'` beyond the window cannot turn a lifetime into a char", () => {
		assert.deepEqual(window_tokens("'a'", 2), [['lifetime', 0, 2]]);
	});

	test('raw-string hashes beyond the window cannot close the string', () => {
		assert.deepEqual(window_tokens('r#"x"#', 5), [['string', 0, 5]]);
	});

	test('a block-comment closer split across the window stays unterminated', () => {
		assert.deepEqual(window_tokens('/* x */', 6), [['comment', 0, 6]]);
	});

	test('a `#![` marker whose `[` is beyond the window does not overrun', () => {
		// only `#!` is in the window — it must not form an attribute across the edge
		assert.deepEqual(window_tokens('#![x]', 2), [['operator', 1, 2]]);
	});

	test('a second `.` beyond the window cannot extend a range operator', () => {
		// only the first `.` is in the window — it stays punctuation rather than
		// consuming the host `..` past the boundary
		assert.deepEqual(window_tokens('...', 1), [['punctuation', 0, 1]]);
		assert.deepEqual(window_tokens('..=', 2), [['operator', 0, 2]]);
	});
});

describe('lexer_rust sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.rs', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'rust');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'rust')).map((t) => t.type)
		);
		for (const t of [
			'keyword',
			'special_keyword',
			'function',
			'macro',
			'class_name',
			'capitalized_identifier',
			'constant',
			'builtin',
			'string',
			'char',
			'lifetime',
			'attribute',
			'comment',
			'doc_comment',
			'number',
			'boolean',
			'operator',
			'punctuation'
		]) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'rust'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'rust'));
		assert.deepEqual(a, b);
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 7) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'rust');
			const issues = validate_syntax_events(lexed);
			assert.deepEqual(issues, [], `prefix of length ${len}`);
		}
	});
});
