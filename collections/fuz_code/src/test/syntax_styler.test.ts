import { describe, test, assert } from 'vitest';

import { SyntaxStyler } from '$lib/syntax_styler.ts';
import { syntax_styler_global } from '$lib/syntax_styler_global.ts';
import { syntax_events_to_tokens, validate_syntax_events, type SyntaxLang } from '$lib/lexer.ts';

describe('SyntaxStyler registry', () => {
	test('has_lang reflects registration and aliases', () => {
		const styler = new SyntaxStyler();
		assert.ok(styler.has_lang('plaintext')); // registered by default
		assert.ok(!styler.has_lang('ts'));
		const lang: SyntaxLang = { id: 'foo', aliases: ['bar'], lex: (l) => (l.pos = l.end) };
		styler.add_lang(lang);
		assert.ok(styler.has_lang('foo'));
		assert.ok(styler.has_lang('bar'));
		assert.ok(!styler.has_lang('baz'));
	});

	test('lex throws on an unregistered language', () => {
		const styler = new SyntaxStyler();
		assert.throws(() => styler.lex('x', 'nope'), /not registered/);
		assert.throws(() => styler.stylize('x', 'nope'), /not registered/);
	});

	test('plaintext emits no tokens and renders escaped but unstyled', () => {
		const lexed = syntax_styler_global.lex('a < b & c', 'plaintext');
		assert.equal(syntax_events_to_tokens(lexed).length, 0);
		assert.equal(syntax_styler_global.stylize('a < b & c', 'plaintext'), 'a &lt; b &amp; c');
	});
});

describe('syntax_styler_global aliases', () => {
	// each alias must resolve to a registered lexer and produce a valid,
	// non-empty event stream — guards against a lexer's aliases going unwired
	const cases: Array<[string, string]> = [
		['js', 'const x = 1;'],
		['javascript', 'const x = 1;'],
		['typescript', 'const x = 1;'],
		['sh', 'echo hi'],
		['shell', 'echo hi'],
		['svg', '<svg></svg>'],
		['mathml', '<math></math>'],
		['xml', '<a></a>'],
		['ssml', '<speak></speak>'],
		['atom', '<feed></feed>'],
		['rss', '<rss></rss>']
	];
	for (const [alias, src] of cases) {
		test(`alias "${alias}" is registered and lexes`, () => {
			assert.ok(syntax_styler_global.has_lang(alias), `${alias} should be registered`);
			const lexed = syntax_styler_global.lex(src, alias);
			assert.deepEqual(validate_syntax_events(lexed), []);
			assert.ok(syntax_events_to_tokens(lexed).length > 0, `${alias} should emit tokens`);
		});
	}
});
