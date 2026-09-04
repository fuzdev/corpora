import { describe, test, assert } from 'vitest';

import {
	advance_probe,
	Lexer,
	lex_syntax,
	render_syntax_html,
	syntax_events_to_tokens,
	token_type,
	token_types_global,
	TokenTypeRegistry,
	validate_syntax_events,
	type LexedSyntax,
	type SyntaxLang
} from '$lib/lexer.ts';

const T_A = token_type('test_a');
const T_B = token_type('test_b');
const T_ALIASED = token_type('test_aliased', ['test_alias_1', 'test_alias_2']);
const T_CONTAINER = token_type('test_container');

const lexed_of = (text: string, build: (l: Lexer) => void): LexedSyntax => {
	const lexer = new Lexer();
	lexer.text = text;
	lexer.end = text.length;
	build(lexer);
	return { text, events: lexer.events, events_len: lexer.events_len, types: token_types_global };
};

describe('token_type', () => {
	test('interns by name and aliases', () => {
		assert.strictEqual(token_type('test_a'), T_A);
		assert.notStrictEqual(token_type('test_a', 'other'), T_A);
	});

	test('precomputes classes and open tag', () => {
		const info = token_types_global.info(T_ALIASED);
		assert.strictEqual(info.classes, 'token_test_aliased token_test_alias_1 token_test_alias_2');
		assert.strictEqual(info.open_tag, `<span class="${info.classes}">`);
	});
});

describe('TokenTypeRegistry', () => {
	test('isolates id spaces per registry', () => {
		const types = new TokenTypeRegistry();
		const global_size = token_types_global.infos.length;
		const t_word = types.intern('word');
		// a fresh registry starts its own id space at 1 (0 is the close tag)
		assert.strictEqual(t_word, 1);
		assert.strictEqual(types.intern('word'), t_word);
		// interning into the isolated registry leaves the global one untouched
		assert.strictEqual(token_types_global.infos.length, global_size);

		const lang: SyntaxLang = {
			id: 'test_isolated',
			lex: (l) => {
				l.leaf(t_word, 0, 4);
				l.pos = l.end;
			}
		};
		const lexed = lex_syntax('abcd', lang, undefined, types);
		assert.strictEqual(lexed.types, types);
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.strictEqual(render_syntax_html(lexed), '<span class="token_word">abcd</span>');
		assert.deepEqual(syntax_events_to_tokens(lexed), [{ type: 'word', start: 0, end: 4 }]);
	});
});

describe('Lexer', () => {
	test('coalesces adjacent same-type leaves', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 2);
			l.leaf(T_A, 2, 4);
			l.leaf(T_B, 4, 5);
		});
		assert.deepEqual(syntax_events_to_tokens(lexed), [
			{ type: 'test_a', start: 0, end: 4 },
			{ type: 'test_b', start: 4, end: 5 }
		]);
	});

	test('does not coalesce across gaps or containers', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 1);
			l.leaf(T_A, 2, 3); // gap between 1 and 2
			l.open(T_CONTAINER, 3);
			l.leaf(T_A, 3, 4);
			l.close(4);
			l.leaf(T_A, 4, 5); // adjacent but separated by a close event
		});
		const tokens = syntax_events_to_tokens(lexed);
		assert.strictEqual(tokens.length, 5);
	});

	test('drops empty leaves', () => {
		const lexed = lexed_of('ab', (l) => {
			l.leaf(T_A, 1, 1);
		});
		assert.strictEqual(lexed.events_len, 0);
	});

	test('grows the event buffer', () => {
		const lexed = lexed_of('x'.repeat(2000), (l) => {
			for (let i = 0; i < 1000; i++) {
				l.leaf(i % 2 === 0 ? T_A : T_B, i * 2, i * 2 + 2);
			}
		});
		assert.strictEqual(syntax_events_to_tokens(lexed).length, 1000);
		assert.deepEqual(validate_syntax_events(lexed), []);
	});
});

describe('advance_probe', () => {
	test('probes, reuses, and re-probes monotonically', () => {
		// fresh cache probes from `from`
		assert.strictEqual(advance_probe('a&b&c', -1, 0, '&'), 1);
		// a cached position at or ahead of `from` is reused as-is
		assert.strictEqual(advance_probe('a&b&c', 3, 2, '&'), 3);
		assert.strictEqual(advance_probe('a&b&c', 1, 1, '&'), 1);
		// a cached position behind `from` re-probes
		assert.strictEqual(advance_probe('a&b&c', 1, 2, '&'), 3);
	});

	test('no further occurrence is Infinity, and Infinity persists', () => {
		assert.strictEqual(advance_probe('abc', -1, 0, '&'), Infinity);
		assert.strictEqual(advance_probe('abc', Infinity, 2, '&'), Infinity);
	});
});

describe('render_syntax_html', () => {
	test('renders leaves with gaps', () => {
		const lexed = lexed_of('a b c', (l) => {
			l.leaf(T_A, 0, 1);
			l.leaf(T_B, 4, 5);
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'<span class="token_test_a">a</span> b <span class="token_test_b">c</span>'
		);
	});

	test('renders nested containers', () => {
		const lexed = lexed_of('abc', (l) => {
			l.open(T_CONTAINER, 0);
			l.leaf(T_A, 1, 2);
			l.close(3);
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'<span class="token_test_container">a<span class="token_test_a">b</span>c</span>'
		);
	});

	test('escapes text content', () => {
		const lexed = lexed_of('a & <b> c', (l) => {
			l.leaf(T_A, 4, 7);
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'a &amp; <span class="token_test_a">&lt;b></span> c'
		);
	});

	test('normalizes non-breaking spaces to regular spaces', () => {
		// U+00A0 in a token span and in gap text both render as a normal space
		const lexed = lexed_of('a\u00a0b\u00a0c', (l) => {
			l.leaf(T_A, 0, 3); // 'a\u00a0b'
		});
		assert.strictEqual(render_syntax_html(lexed), '<span class="token_test_a">a b</span> c');
	});
});

describe('validate_syntax_events', () => {
	test('flags overlapping leaves', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 3);
			l.leaf(T_B, 2, 4);
		});
		assert.isNotEmpty(validate_syntax_events(lexed));
	});

	test('flags unclosed containers', () => {
		const lexed = lexed_of('abc', (l) => {
			l.open(T_CONTAINER, 0);
		});
		assert.isNotEmpty(validate_syntax_events(lexed));
	});

	test('accepts a valid stream', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 2);
			l.open(T_CONTAINER, 2);
			l.leaf(T_B, 2, 3);
			l.leaf(T_A, 3, 4);
			l.close(5);
			l.leaf(T_B, 5, 6);
		});
		assert.deepEqual(validate_syntax_events(lexed), []);
	});
});

describe('embed', () => {
	test('lexes a window with another registered language', () => {
		const inner: SyntaxLang = {
			id: 'test_inner',
			lex: (l) => {
				l.leaf(T_B, l.pos, l.end);
				l.pos = l.end;
			}
		};
		const outer: SyntaxLang = {
			id: 'test_outer',
			lex: (l) => {
				l.open(T_CONTAINER, 0);
				l.embed('test_inner', 1, 3);
				l.close(4);
				l.pos = l.end;
			}
		};
		const langs = new Map([
			['test_inner', inner],
			['test_outer', outer]
		]);
		const lexed = lex_syntax('abcd', outer, langs);
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.deepEqual(syntax_events_to_tokens(lexed), [
			{ type: 'test_container', start: 0, end: 4 },
			{ type: 'test_b', start: 1, end: 3 }
		]);
	});
});
