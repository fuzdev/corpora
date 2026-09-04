import { describe, test, assert } from 'vitest';
import { readFileSync } from 'node:fs';

import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { SyntaxStyler } from '$lib/syntax_styler.ts';
import { lexer_ts } from '$lib/lexer_ts.ts';
import {
	syntax_events_to_tokens,
	token_type,
	validate_syntax_events,
	type SyntaxLang
} from '$lib/lexer.ts';

/**
 * Lexes `text` as ts and returns `[type, text]` pairs.
 * Containers appear before their children with their full span text.
 */
const tokens_of = (text: string): Array<[string, string]> =>
	syntax_events_to_tokens(syntax_styler_global.lex(text, 'ts')).map((t) => [
		t.type,
		text.slice(t.start, t.end)
	]);

/**
 * Like `tokens_of` but only `[type, text]` of the named types — for targeted
 * assertions that ignore surrounding punctuation/operators.
 */
const picked = (text: string, types: Array<string>): Array<[string, string]> =>
	tokens_of(text).filter(([type]) => types.includes(type));

describe('lexer_ts keywords', () => {
	test('main and special keywords', () => {
		assert.deepEqual(picked('if (x) return new Foo();', ['keyword', 'special_keyword']), [
			['special_keyword', 'if'],
			['special_keyword', 'return'],
			['keyword', 'new']
		]);
	});

	test('keywords after member access are properties, not keywords', () => {
		assert.deepEqual(picked('a.delete(); b?.new;', ['keyword', 'special_keyword']), []);
		// and `a.delete()` is a function call
		assert.deepEqual(picked('a.delete();', ['function']), [['function', 'delete']]);
	});

	test('contextual keywords', () => {
		assert.deepEqual(picked('async () => x; const get = 1; get x() {}', ['keyword']), [
			['keyword', 'async'],
			['keyword', 'const'],
			['keyword', 'get']
		]);
	});

	test('null and undefined are keywords, true/false booleans, NaN a number', () => {
		assert.deepEqual(tokens_of('null undefined true NaN'), [
			['keyword', 'null'],
			['keyword', 'undefined'],
			['boolean', 'true'],
			['number', 'NaN']
		]);
	});
});

describe('lexer_ts strings and templates', () => {
	test('string properties in object literals', () => {
		assert.deepEqual(picked('{"a": 1, \'b\': 2}', ['string_property', 'string']), [
			['string_property', '"a"'],
			['string_property', "'b'"]
		]);
	});

	test('ternary strings are not properties', () => {
		assert.deepEqual(picked('x ? "a" : "b"', ['string_property', 'string']), [
			['string', '"a"'],
			['string', '"b"']
		]);
	});

	test('strings containing // are not comments', () => {
		assert.deepEqual(picked('const a = "x // y";', ['string', 'comment']), [
			['string', '"x // y"']
		]);
	});

	test('template strings with interpolation', () => {
		const tokens = tokens_of('`a${b}c`');
		assert.deepEqual(tokens, [
			['template_string', '`a${b}c`'],
			['template_punctuation', '`'],
			['string', 'a'],
			['interpolation', '${b}'],
			['interpolation_punctuation', '${'],
			['interpolation_punctuation', '}'],
			['string', 'c'],
			['template_punctuation', '`']
		]);
	});

	test('nested templates in interpolations', () => {
		const text = '`a${`b${c}`}d`';
		const lexed = syntax_styler_global.lex(text, 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.strictEqual(types.filter((t) => t === 'template_string').length, 2);
	});

	test('unterminated template extends to end', () => {
		const lexed = syntax_styler_global.lex('`abc', 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const tokens = syntax_events_to_tokens(lexed);
		assert.strictEqual(tokens[0]!.type, 'template_string');
		assert.strictEqual(tokens[0]!.end, 4);
	});

	test('nested braces inside an interpolation are depth-tracked', () => {
		assert.deepEqual(picked('`${ {a: 1} }`', ['interpolation']), [
			['interpolation', '${ {a: 1} }']
		]);
	});

	test('interpolation spans a regex literal containing `}`', () => {
		// the interpolation's end is discovered during real tokenization, so the
		// `}` inside the regex body cannot close it early
		const text = '`${/}/.test(x)}`';
		assert.deepEqual(validate_syntax_events(syntax_styler_global.lex(text, 'ts')), []);
		assert.deepEqual(picked(text, ['interpolation', 'regex']), [
			['interpolation', '${/}/.test(x)}'],
			['regex', '/}/']
		]);
	});

	test('a malformed interpolation interior propagates to the template end', () => {
		// an unterminated block comment consumes the closing `}` and backtick,
		// so the damage extends editor-style instead of being contained
		const text = '`${/* oops}` and more';
		const lexed = syntax_styler_global.lex(text, 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const comment = syntax_events_to_tokens(lexed).find((t) => t.type === 'comment');
		assert.ok(comment);
		assert.strictEqual(comment.end, text.length);
	});
});

describe('lexer_ts regex vs division', () => {
	test('regex literal in expression position', () => {
		assert.deepEqual(picked('const re = /ab+c/gi;', ['regex', 'regex_source', 'regex_flags']), [
			['regex', '/ab+c/gi'],
			['regex_source', 'ab+c'],
			['regex_flags', 'gi']
		]);
	});

	test('division is not a regex', () => {
		assert.deepEqual(picked('const x = a / b / c;', ['regex']), []);
	});

	test('regex after return keyword', () => {
		assert.deepEqual(picked('return /x/;', ['regex']), [['regex', '/x/']]);
	});

	test('regex with slash in character class', () => {
		assert.deepEqual(picked('x = /[/]/;', ['regex']), [['regex', '/[/]/']]);
	});
});

describe('lexer_ts identifiers', () => {
	test('class contexts', () => {
		assert.deepEqual(picked('class Foo extends Bar {}', ['class_name']), [
			['class_name', 'Foo'],
			['class_name', 'Bar']
		]);
		assert.deepEqual(picked('new a.b.Thing()', ['class_name']), [
			['class_name', 'a'],
			['class_name', 'b'],
			['class_name', 'Thing']
		]);
	});

	test('constants and capitalized identifiers', () => {
		assert.deepEqual(tokens_of('MAX_VALUE Foo'), [
			['constant', 'MAX_VALUE'],
			['capitalized_identifier', 'Foo']
		]);
	});

	test('function calls and function-valued variables', () => {
		assert.deepEqual(picked('foo(); const f = (a) => a;', ['function', 'function_variable']), [
			['function', 'foo'],
			['function_variable', 'f']
		]);
	});

	test('generic function calls', () => {
		const tokens = tokens_of('foo<Bar>(x)');
		assert.deepEqual(tokens[0], ['generic_function', 'foo<Bar>']);
		assert.deepEqual(picked('foo<Bar>(x)', ['function', 'type_name']), [
			['function', 'foo'],
			['type_name', 'Bar']
		]);
	});

	test('comparisons are not generics', () => {
		assert.deepEqual(picked('a < b; c > d;', ['generic_function']), []);
		assert.deepEqual(picked('a < b; c > d;', ['operator']), [
			['operator', '<'],
			['operator', '>']
		]);
	});

	test('comparisons across statement or interpolation boundaries are not generics', () => {
		// an unbalanced `)`/`}`/`]` between `<` and `>` rejects the generic scan
		assert.deepEqual(picked('if (a < b) { } x > (c);', ['generic_function']), []);
		const text = '`${a < b} ${c > (d)}`';
		assert.deepEqual(picked(text, ['generic_function']), []);
		assert.deepEqual(picked(text, ['interpolation']), [
			['interpolation', '${a < b}'],
			['interpolation', '${c > (d)}']
		]);
	});

	test('balanced object and tuple types stay inside generics', () => {
		assert.deepEqual(picked('foo<{a: B}>(x); bar<[C, D]>(y);', ['generic_function']), [
			['generic_function', 'foo<{a: B}>'],
			['generic_function', 'bar<[C, D]>']
		]);
	});

	test('lowercase builtins', () => {
		assert.deepEqual(picked('console.log(x); const s: unknown = 1;', ['builtin']), [
			['builtin', 'console'],
			['builtin', 'unknown'] // inside the type annotation region
		]);
	});
});

describe('lexer_ts type syntax', () => {
	test('type alias declarations', () => {
		assert.deepEqual(picked('type Foo = Bar;', ['keyword', 'class_name']), [
			['keyword', 'type'],
			['class_name', 'Foo']
		]);
	});

	test('import type', () => {
		assert.deepEqual(picked("import type {A} from 'b';", ['import_type_keyword']), [
			['import_type_keyword', 'type']
		]);
	});

	test('type assertions with as and satisfies', () => {
		assert.deepEqual(picked('x as Foo; y satisfies Baz;', ['type_assertion']), [
			['type_assertion', 'Foo'],
			['type_assertion', 'Baz']
		]);
	});

	test('type annotations with initializers', () => {
		const tokens = tokens_of('const x: Map<string, Foo> = y;');
		const annotation = tokens.find(([type]) => type === 'type_annotation');
		assert.ok(annotation);
		assert.deepEqual(picked('const x: Map<string, Foo> = y;', ['type_name']), [
			['type_name', 'Map'],
			['type_name', 'Foo']
		]);
	});

	test('object literal colons are not annotations', () => {
		assert.deepEqual(picked('const o = {a: b};', ['type_annotation']), []);
	});
});

describe('lexer_ts decorators and misc', () => {
	test('decorators', () => {
		assert.deepEqual(tokens_of('@component'), [
			['decorator', '@component'],
			['at', '@'],
			['function', 'component']
		]);
	});

	test('hashbang', () => {
		assert.deepEqual(tokens_of('#!/usr/bin/env node\nx')[0], ['hashbang', '#!/usr/bin/env node']);
	});

	test('numeric formats', () => {
		assert.deepEqual(picked('0xff 0b10 1_000n 1.5e-3 .5', ['number']), [
			['number', '0xff'],
			['number', '0b10'],
			['number', '1_000n'],
			['number', '1.5e-3'],
			['number', '.5']
		]);
	});

	test('spread and optional chaining operators', () => {
		assert.deepEqual(picked('f(...a); b?.c ?? d;', ['operator']), [
			['operator', '...'],
			['operator', '?.'],
			['operator', '??']
		]);
	});
});

describe('lexer_ts sample', () => {
	const content = readFileSync('src/test/fixtures/samples/sample_complex.ts', 'utf8');

	test('sample lexes with valid invariants', () => {
		const lexed = syntax_styler_global.lex(content, 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
	});

	test('sample produces its characteristic token types', () => {
		const types = new Set(
			syntax_events_to_tokens(syntax_styler_global.lex(content, 'ts')).map((t) => t.type)
		);
		for (const t of ['keyword', 'string', 'comment', 'number', 'function', 'operator']) {
			assert.ok(types.has(t), `expected a ${t} token in the sample`);
		}
	});

	test('every prefix lexes without throwing, with valid invariants', () => {
		for (let len = 0; len <= content.length; len += 13) {
			const prefix = content.slice(0, len);
			const lexed = syntax_styler_global.lex(prefix, 'ts');
			const issues = validate_syntax_events(lexed);
			assert.deepEqual(issues, [], `prefix of length ${len}`);
		}
	});

	test('lexing is deterministic', () => {
		const a = syntax_events_to_tokens(syntax_styler_global.lex(content, 'ts'));
		const b = syntax_events_to_tokens(syntax_styler_global.lex(content, 'ts'));
		assert.deepEqual(a, b);
	});
});

describe('lexer_ts deep nesting', () => {
	test('deeply nested template interpolations tokenize fully without overflowing the stack', () => {
		const depth = 20000;
		const input = '`${'.repeat(depth) + '1' + '}`'.repeat(depth);
		const lexed = syntax_styler_global.lex(input, 'ts');
		assert.deepEqual(validate_syntax_events(lexed), []);
		const types = syntax_events_to_tokens(lexed).map((t) => t.type);
		assert.equal(types.filter((t) => t === 'template_string').length, depth);
		assert.equal(types.filter((t) => t === 'interpolation').length, depth);
	});

	test('shallow nested templates tokenize their interiors', () => {
		const types = tokens_of('`a${`b${c}d`}e`').map(([type]) => type);
		assert.equal(types.filter((t) => t === 'template_string').length, 2);
		assert.equal(types.filter((t) => t === 'interpolation').length, 2);
	});
});

describe('lexer_ts as an embedded guest', () => {
	// a host lexer embeds ts over `[0, split)` then emits its own token for the
	// tail. Built-in embedders trim ts regions to a whitespace/delimiter
	// boundary, but the public `Lexer.embed` API lets a custom lexer end the
	// window mid-construct — where an unbounded number/spread peek used to read
	// and emit one char past `split`, producing an out-of-window (invalid) span.
	const T_TAIL = token_type('comment');
	const embed_ts = (text: string, split: number) => {
		const host: SyntaxLang = {
			id: 'ts_embed_host',
			lex: (l) => {
				l.embed('ts', 0, split);
				if (l.end > split) l.leaf(T_TAIL, split, l.end);
			}
		};
		const styler = new SyntaxStyler();
		styler.add_lang(lexer_ts);
		styler.add_lang(host);
		return styler.lex(text, 'ts_embed_host');
	};

	// each split lands mid-construct: after `e`/`e+`, inside `0x`, mid-`..`
	for (const [text, split] of [
		['9e+5', 2],
		['9e-5', 2],
		['0xff', 1],
		['0n', 1],
		['a...', 3],
		['1.5', 2]
	] as Array<[string, number]>) {
		test(`stays within its window: ${JSON.stringify(text)} @ ${split}`, () => {
			const lexed = embed_ts(text, split);
			// the guest must not emit past `split` — else it overlaps the host tail
			assert.deepEqual(validate_syntax_events(lexed), []);
			for (const t of syntax_events_to_tokens(lexed)) {
				assert.ok(
					!(t.start < split && t.end > split),
					`token ${t.type} [${t.start},${t.end}) crosses the embed boundary ${split}`
				);
			}
		});
	}

	test('a spread fully inside the window is still recognized', () => {
		const lexed = embed_ts('...x', 4);
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.ok(
			syntax_events_to_tokens(lexed).some((t) => t.type === 'operator' && t.end - t.start === 3)
		);
	});
});
