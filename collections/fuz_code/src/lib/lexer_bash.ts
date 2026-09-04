import {
	is_ascii_alnum,
	is_ascii_word,
	is_digit,
	is_hex_digit,
	is_space,
	scan_to_line_end,
	skip_space,
	token_type,
	words_map,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * Hand-written Bash/shell lexer.
 *
 * Emits: `shebang`, `comment`, `string` (double-quoted strings are containers
 * whose `$`-expansions nest as `variable`/`command_substitution`), `keyword`,
 * `builtin`, `boolean`, `number`, `variable`, `command_substitution` (a
 * container), `function`, `file_descriptor`, `operator`, `punctuation`, plus
 * heredocs (`heredoc` container + `heredoc_delimiter`).
 *
 * Notable behavior:
 * - command substitution is recognized in both `$(…)` and legacy backtick
 *   form; both are `command_substitution` containers with an ordinary-bash
 *   interior.
 * - arithmetic expansion `$((…))` is recognized as distinct from command
 *   substitution `$(…)`; its `$((`/`))` are punctuation and the interior lexes
 *   as ordinary bash (numbers, `$vars`, and general operators fall out
 *   naturally — no dedicated arithmetic token types).
 * - heredocs match any delimiter, honor `<<-`, and support quoted (no
 *   expansion) vs unquoted (expanded) bodies; multiple heredocs redirected on
 *   one line are queued and their bodies consumed in order.
 * - `${…}` parameter expansion spans balanced braces — nested expansions
 *   (`${a:-${b}}`) and quoted `}`s stay inside the one `variable` token.
 *
 * Word classification (keyword/builtin/boolean) is a context-free `Map`
 * lookup.
 *
 * Nesting (`$(…)`/`$((…))`/backtick interiors, double-quoted string bodies,
 * unquoted heredoc bodies) runs on an explicit pooled frame stack, so
 * arbitrarily deep input tokenizes fully without touching the JS call stack.
 *
 * Scope: the bash family — registered as `sh`, with `bash`/`shell` as
 * aliases. POSIX sh is a syntactic subset of bash for highlighting purposes
 * (everything sh scripts use — `$(…)`, `$((…))`, backticks, heredocs, `${…}`
 * — is shared syntax), and bash-only forms don't occur in sh input. Shells
 * with their own syntax (fish, PowerShell) are out of scope.
 *
 * Resilience: unterminated single-line constructs stop at the line boundary;
 * unterminated strings, command substitutions, and heredocs extend to the
 * window end. `$(…)`/`$((…))` interiors discover their own closing delimiter
 * during real tokenization (nothing is prescanned), so a `)` inside a comment,
 * string, or heredoc body never ends a substitution early. The tradeoff is
 * that damage propagates rather than being contained: a malformed interior
 * that consumes the closing `)` (say an unterminated string) extends the
 * substitution past it, editor-style.
 *
 * @module
 */

const T_SHEBANG = token_type('shebang', 'comment');
const T_COMMENT = token_type('comment');
const T_STRING = token_type('string');
const T_KEYWORD = token_type('keyword');
const T_BUILTIN = token_type('builtin');
const T_BOOLEAN = token_type('boolean');
const T_NUMBER = token_type('number');
const T_VARIABLE = token_type('variable');
const T_COMMAND_SUBSTITUTION = token_type('command_substitution');
const T_FUNCTION = token_type('function');
const T_FILE_DESCRIPTOR = token_type('file_descriptor', 'important');
const T_OPERATOR = token_type('operator');
const T_PUNCTUATION = token_type('punctuation');
const T_HEREDOC = token_type('heredoc', 'string');
const T_HEREDOC_DELIMITER = token_type('heredoc_delimiter', 'punctuation');

const K_KEYWORD = 1;
const K_BUILTIN = 2;
const K_BOOLEAN = 3;

const WORDS: Map<string, number> = words_map(
	[
		K_KEYWORD,
		'if then else elif fi for while until do done case esac in select function return local ' +
			'export declare typeset readonly unset set shift trap break continue coproc time'
	],
	[
		K_BUILTIN,
		'echo printf cd pwd read test source eval exec exit getopts hash type ulimit umask wait kill ' +
			'jobs bg fg disown alias unalias command shopt'
	],
	[K_BOOLEAN, 'true false']
);

// `$`-followed single-char special variables (`$@ $# $? $$ $! $* $-`); digits
// are handled by the `$word` scan
const SPECIAL_VAR: Set<number> = new Set([33, 64, 35, 36, 42, 63, 45]);

const skip_blank = (text: string, from: number, end: number): number => {
	let i = from;
	while (i < end && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i++;
	return i;
};

// index of the next `\n` at or after `i` (or `end`) — for stepping between
// heredoc lines. Distinct from `scan_to_line_end`, which stops *before* a
// trailing `\r` and is used for single-line token boundaries.
const line_end_of = (text: string, i: number, end: number): number => {
	const nl = text.indexOf('\n', i);
	return nl === -1 || nl >= end ? end : nl;
};

/**
 * Scans a bash numeric literal from the digit at `i`: hex (`0x…`), base-N
 * (`\d+#[alnum]+`), or plain decimal (`\d+`, covering octal). Returns the
 * exclusive end.
 */
const scan_bash_number = (text: string, i: number, end: number): number => {
	if (text.charCodeAt(i) === 48 && (text.charCodeAt(i + 1) | 0x20) === 120) {
		let j = i + 2;
		while (j < end && is_hex_digit(text.charCodeAt(j))) j++;
		return j;
	}
	let j = i;
	while (j < end && is_digit(text.charCodeAt(j))) j++;
	if (
		j < end &&
		text.charCodeAt(j) === 35 &&
		j + 1 < end &&
		is_ascii_alnum(text.charCodeAt(j + 1))
	) {
		j++;
		while (j < end && is_ascii_alnum(text.charCodeAt(j))) j++;
	}
	return j;
};

/**
 * Skips a `'` or `"` quoted span (for the `${…}` balance scan), returning the
 * index after the closing quote or the window end. Single quotes are literal;
 * double quotes honor `\` escapes.
 */
const skip_bash_quote = (text: string, from: number, end: number, quote: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92 && quote === 34) i += 2;
		else if (c === quote) return i + 1;
		else i++;
	}
	return end;
};

/**
 * Scans a `$'…'` ANSI-C string from the `$` at `i`, returning the exclusive
 * end (with `\` escapes; unterminated extends to the window end).
 */
const scan_ansi_c = (text: string, i: number, end: number): number => {
	let j = i + 2;
	while (j < end) {
		const c = text.charCodeAt(j);
		if (c === 92) j += 2;
		else if (c === 39) return j + 1;
		else j++;
	}
	return end;
};

/**
 * Emits a `$`-variable at `i` (`${…}`, `$word`, or `$special`), returning the
 * new position. A `$` with no valid expansion after it is plain text (returns
 * `i + 1` with no token).
 */
const scan_dollar_var = (l: Lexer, i: number, to: number): number => {
	const { text } = l;
	const c1 = text.charCodeAt(i + 1);
	if (c1 === 123) {
		// `${…}` — balanced braces, so nested expansions (`${a:-${b}}`) span
		// fully; quoted spans are skipped (`${a:-"}"}`) and `\` escapes the
		// next char; unterminated extends to the window end
		let depth = 1;
		let j = i + 2;
		while (j < to) {
			const c = text.charCodeAt(j);
			if (c === 34 || c === 39) {
				j = skip_bash_quote(text, j, to, c);
			} else if (c === 92) {
				j += 2;
			} else if (c === 123) {
				depth++;
				j++;
			} else if (c === 125) {
				depth--;
				j++;
				if (depth === 0) break;
			} else {
				j++;
			}
		}
		const end = j > to ? to : j;
		l.leaf(T_VARIABLE, i, end);
		return end;
	}
	if (is_ascii_word(c1)) {
		let j = i + 1;
		while (j < to && is_ascii_word(text.charCodeAt(j))) j++;
		l.leaf(T_VARIABLE, i, j);
		return j;
	}
	if (SPECIAL_VAR.has(c1)) {
		l.leaf(T_VARIABLE, i, i + 2);
		return i + 2;
	}
	return i + 1; // bare `$`
};

// Explicit-stack driver for nested constructs (`$(…)`/`$((…))`/backtick
// substitution interiors, double-quoted string bodies, and unquoted heredoc
// bodies). Every frame is a window scan — a substitution pushes a frame rather
// than recursing on the JS call stack, so arbitrarily deep input tokenizes
// fully without overflowing; the deep-nesting tests exercise this to thousands
// of levels. String and heredoc bodies are cheaper than a frame: they scan
// inline, and when one is interrupted by a substitution the window frame
// records a *submode* so the resume finishes the body before returning to the
// main scan. Frames are pooled across a single `lex_bash` run (`stack` only
// grows, never shrinks) to keep deep nesting allocation-free after warmup.

// a window frame's suspended mid-construct scan
const S_NONE = 0;
const S_DQUOTE = 1; // mid-`"…"` body, suspended at a substitution
const S_HEREDOC = 2; // mid-heredoc body, suspended at a substitution

// how a completed frame finalizes into the frame beneath it
const R_ROOT = 0; // top-level window — nothing beneath it
const R_CMDSUB = 1; // `$(…)` interior → emit `)`, close the container, advance
const R_ARITH = 2; // `$((…))` interior → emit `))`, advance
const R_BACKTICK = 3; // backtick interior → emit the closing backtick, close, advance

/**
 * One suspended window scan on the explicit stack, carrying the per-window
 * scan state (cursor, `function` keyword tracking, the pending-heredoc queue)
 * plus the submode of an interrupted string/heredoc body. `ret`/`ret_a`
 * describe how the frame finalizes into the one beneath it when it completes.
 */
interface BashFrame {
	/** Scan cursor. */
	i: number;
	/** Exclusive window end. */
	to: number;
	/** Mid-construct submode — an interrupted body scan resumed before the main scan. */
	sub: number;
	/** `S_HEREDOC`: the delimiter word, for resumed close-line discovery. */
	hd_delim: string;
	/** `S_HEREDOC`: quoted heredoc (a plain, unexpanded body). */
	hd_quoted: boolean;
	/** `S_HEREDOC`: an inline (contiguous, sole) heredoc vs a drained one — selects the resume position. */
	hd_inline: boolean;
	/** `S_HEREDOC`: `<<-` redirect — the close delimiter may be blank-indented. */
	hd_dash: boolean;
	/** `S_HEREDOC`: discovered closing delimiter start, or -1 when unterminated. */
	hd_delim_start: number;
	/** `S_HEREDOC`: discovered closing delimiter end. */
	hd_delim_end: number;
	/** `S_HEREDOC`: where the main scan resumes after the body. */
	hd_resume: number;
	/** A `function` keyword awaits its name. */
	prev_function_kw: boolean;
	/** Heredocs redirected on the current line, bodies pending. Pooled with the frame. */
	pending: Array<PendingHeredoc>;
	/** Drain progress into `pending`. */
	pending_idx: number;
	/** Whether a drain of `pending` is in progress at a line boundary. */
	draining: boolean;
	/**
	 * Self-discovery terminator for the window: the char code that ends it
	 * (`)` for `$(…)`/`$((…))` interiors), or 0 when the window's end was known
	 * at push time. The frame finds its own end during real tokenization —
	 * strings, comments, and heredoc bodies consume their delimiter chars
	 * inside their token scans, so only a real closing delimiter terminates.
	 */
	term: number;
	/**
	 * Open-delimiter depth for `term` windows. Nested substitutions push their
	 * own frames, so this only counts the frame's own unclosed `(`s (plus the
	 * enclosing parens for `$((…))`, which starts at 2); the `term` char that
	 * would bring it to 0 terminates the window (recorded in `ret_a`).
	 */
	depth: number;
	ret: number;
	/** The discovered closing-delimiter position (-1 while undiscovered/unterminated). */
	ret_a: number;
}

interface BashMachine {
	l: Lexer;
	/** Frame pool doubling as the stack; frames above `sp` are dormant. */
	stack: Array<BashFrame>;
	sp: number;
}

const create_bash_frame = (): BashFrame => ({
	i: 0,
	to: 0,
	sub: S_NONE,
	hd_delim: '',
	hd_quoted: false,
	hd_inline: false,
	hd_dash: false,
	hd_delim_start: -1,
	hd_delim_end: 0,
	hd_resume: 0,
	prev_function_kw: false,
	pending: [],
	pending_idx: 0,
	draining: false,
	term: 0,
	depth: 0,
	ret: R_ROOT,
	ret_a: 0
});

/**
 * Pushes a window frame scanning `[from, to)`, reusing the pooled slot at the
 * stack top. `ret`/`ret_a` are applied when it completes. A nonzero `term`
 * makes the window self-discovering: it terminates at the `term` char that
 * brings `depth` to 0, writing the discovered position to `ret_a`.
 */
const mac_push_window = (
	mac: BashMachine,
	from: number,
	to: number,
	ret: number,
	ret_a: number,
	term: number,
	depth: number
): void => {
	const { stack, sp } = mac;
	let f = stack[sp];
	if (f === undefined) {
		f = create_bash_frame();
		stack[sp] = f;
	}
	f.i = from;
	f.to = to;
	f.sub = S_NONE;
	f.prev_function_kw = false;
	if (f.pending.length > 0) f.pending.length = 0;
	f.pending_idx = 0;
	f.draining = false;
	f.term = term;
	f.depth = depth;
	f.ret = ret;
	f.ret_a = ret_a;
	mac.sp = sp + 1;
};

/**
 * Starts a `$(…)` command substitution or `$((…))` arithmetic expansion at
 * `i`: emits the opening events and pushes the interior window frame, which
 * discovers its own closing delimiter. The caller must suspend (write back its
 * state and return `false`); the driver's finalize emits the trailing
 * punctuation and advances the caller past it. The `i + 2 < to` guard keeps
 * the arithmetic lookahead inside the window.
 */
const mac_push_dollar_paren = (mac: BashMachine, i: number, to: number): void => {
	const l = mac.l;
	const { text } = l;
	if (i + 2 < to && text.charCodeAt(i + 2) === 40) {
		// arithmetic expansion — `$((`/`))` are punctuation and the interior
		// lexes as ordinary bash; the window starts inside both parens
		// (depth 2), so the first closer of a well-formed `))` is emitted by
		// the interior and the second by the finalize (coalesced into one leaf)
		l.leaf(T_PUNCTUATION, i, i + 3); // `$((`
		mac_push_window(mac, i + 3, to, R_ARITH, -1, 41, 2);
		return;
	}
	// command substitution — a container with an ordinary-bash interior
	l.open(T_COMMAND_SUBSTITUTION, i);
	l.leaf(T_PUNCTUATION, i, i + 2); // `$(`
	mac_push_window(mac, i + 2, to, R_CMDSUB, -1, 41, 1);
};

/**
 * Starts a legacy backtick command substitution at `i`: emits the container
 * open and opening backtick, and pushes the interior window frame. A backslash
 * escapes the next char (e.g. an inner backtick); unterminated extends to `to`.
 */
const mac_push_backtick = (mac: BashMachine, i: number, to: number): void => {
	const l = mac.l;
	const { text } = l;
	let j = i + 1;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
		} else if (c === 96) {
			break;
		} else {
			j++;
		}
	}
	const closed = j < to && text.charCodeAt(j) === 96;
	l.open(T_COMMAND_SUBSTITUTION, i);
	l.leaf(T_PUNCTUATION, i, i + 1); // opening backtick
	mac_push_window(mac, i + 1, closed ? j : to, R_BACKTICK, closed ? j : -1, 0, 0);
};

/**
 * Scans a `"…"` body from `j` (past the opening quote), emitting `$`-variable
 * leaves as it goes. Returns the exclusive end (past the closing quote, or the
 * window end when unterminated), or the bitwise complement of the position of
 * a `$(`/backtick nesting construct — the fast path lets bodies without
 * substitutions complete without a frame.
 */
const scan_dquote_body = (l: Lexer, j: number, to: number): number => {
	const { text } = l;
	let i = j;
	while (i < to) {
		const c = text.charCodeAt(i);
		if (c === 92) {
			i += 2;
		} else if (c === 34) {
			return i + 1;
		} else if (c === 36) {
			if (text.charCodeAt(i + 1) === 40) return ~i;
			i = scan_dollar_var(l, i, to);
		} else if (c === 96) {
			return ~i;
		} else {
			i++;
		}
	}
	return i > to ? to : i;
};

interface PendingHeredoc {
	delim: string;
	quoted: boolean;
	dash: boolean;
}

/**
 * Scans a heredoc body from `j` toward `frame.to`, emitting `$`-variable leaves
 * (unquoted bodies only) and discovering the closing-delimiter line in the same
 * forward pass. There is no prescan for the close: the scan suspends at the
 * first `$(…)` it meets (returning the bitwise complement of its position), so
 * deeply `$(…)`-nested heredocs stay linear instead of re-scanning overlapping
 * suffixes.
 *
 * Reads `frame.hd_delim`/`hd_quoted`/`hd_inline`. `j` may be mid-line (a resume
 * past a substitution) — a closing line is recognized only at a real line
 * start, so the current line finishes first. On the close line, records
 * `frame.hd_delim_start`/`hd_delim_end`/`hd_resume` and returns the body end
 * (the close line's start). On a `$(` substitution, returns the bitwise
 * complement of its position. When unterminated, records `hd_delim_start = -1`,
 * `hd_resume = frame.to`, and returns `frame.to`.
 */
const scan_heredoc_body = (l: Lexer, frame: BashFrame, j: number): number => {
	const { text } = l;
	const to = frame.to;
	const delim = frame.hd_delim;
	const quoted = frame.hd_quoted;
	let i = j;
	while (i < to) {
		const le = line_end_of(text, i, to);
		// the line's content excludes a trailing `\r` (CRLF)
		const content_end = le > i && text.charCodeAt(le - 1) === 13 ? le - 1 : le;
		// a closing line is (optional blanks) + `delim` + (only blanks) — checked
		// only at a real line start, so a mid-line resume finishes its line first
		if (i === 0 || text.charCodeAt(i - 1) === 10) {
			// `<<-` allows the close delimiter to be blank-indented; plain `<<`
			// requires it at column 0. Either way the delimiter must be the whole
			// (indent-stripped) line — no trailing content, blanks included.
			const k = frame.hd_dash ? skip_blank(text, i, content_end) : i;
			if (text.startsWith(delim, k) && k + delim.length === content_end) {
				frame.hd_delim_start = k;
				frame.hd_delim_end = k + delim.length;
				frame.hd_resume = frame.hd_inline ? k + delim.length : le >= to ? to : le + 1;
				return i;
			}
		}
		if (!quoted) {
			let p = i;
			while (p < content_end) {
				const d = text.indexOf('$', p);
				if (d === -1 || d >= content_end) break;
				if (text.charCodeAt(d + 1) === 40) return ~d; // `$(` — suspend
				p = scan_dollar_var(l, d, to);
				if (p > content_end) break; // a `${…}` spanned past this line
			}
			if (p > content_end) {
				// a `${…}` ran past this line — resume the walk at the next line start
				i = p >= to ? to : line_end_of(text, p, to);
				if (i < to) i++;
				continue;
			}
		}
		if (le >= to) break;
		i = le + 1;
	}
	frame.hd_delim_start = -1;
	frame.hd_resume = to;
	return to;
};

/**
 * Drains queued heredoc bodies from `frame.i` (just past a newline), consuming
 * each in order. A body interrupted by a substitution suspends the window
 * mid-body (`S_HEREDOC`) — this returns `false`, and the submode resume
 * finishes the body and re-enters here for the rest of the queue. Returns
 * `true` once the queue is empty.
 */
const drain_pending = (mac: BashMachine, frame: BashFrame): boolean => {
	const l = mac.l;
	const to = frame.to;
	const { pending } = frame;
	while (frame.pending_idx < pending.length) {
		if (frame.i >= to) break;
		const hd = pending[frame.pending_idx]!;
		frame.pending_idx++;
		const body_start = frame.i;
		l.open(T_HEREDOC, body_start);
		frame.hd_delim = hd.delim;
		frame.hd_quoted = hd.quoted;
		frame.hd_inline = false;
		frame.hd_dash = hd.dash;
		const r = scan_heredoc_body(l, frame, body_start);
		if (r < 0) {
			// the body hit a substitution — suspend mid-body; the submode resume
			// finishes it (and this drain) afterward
			frame.sub = S_HEREDOC;
			mac_push_dollar_paren(mac, ~r, to);
			return false;
		}
		if (frame.hd_delim_start === -1) {
			l.close(to);
		} else {
			l.leaf(T_HEREDOC_DELIMITER, frame.hd_delim_start, frame.hd_delim_end);
			l.close(frame.hd_delim_end);
		}
		frame.i = frame.hd_resume;
	}
	pending.length = 0;
	frame.pending_idx = 0;
	frame.draining = false;
	return true;
};

/**
 * Scans a multi-char operator starting at `i` for the leading char `c`
 * (one of `| & > !`); heredoc, `<<<`, `;;`, and `=` cases are handled by the
 * caller. Returns its length.
 */
const bash_operator_len = (text: string, i: number, to: number, c: number): number => {
	const c1 = i + 1 < to ? text.charCodeAt(i + 1) : 0;
	switch (c) {
		case 124: // |
			return c1 === 124 ? 2 : 1; // || |
		case 38: // &
			if (c1 === 38) return 2; // &&
			if (c1 === 62) return text.charCodeAt(i + 2) === 62 ? 3 : 2; // &>> &>
			return 1; // &
		case 62: // >
			return c1 === 62 ? 2 : 1; // >> >
		default: // 33 `!`
			return c1 === 61 ? 2 : 1; // != !
	}
};

/**
 * Resumes a window frame's interrupted string/heredoc body scan (`frame.sub`).
 * Returns `false` when the body hit another substitution and the frame
 * suspended again; on completion clears the submode and returns `true`, with
 * `frame.i` at the main scan's resume position.
 */
const run_bash_sub = (mac: BashMachine, frame: BashFrame): boolean => {
	const l = mac.l;
	if (frame.sub === S_HEREDOC) {
		const r = scan_heredoc_body(l, frame, frame.i);
		if (r < 0) {
			frame.i = ~r;
			mac_push_dollar_paren(mac, ~r, frame.to);
			return false;
		}
		if (frame.hd_delim_start === -1) {
			l.close(frame.to);
		} else {
			l.leaf(T_HEREDOC_DELIMITER, frame.hd_delim_start, frame.hd_delim_end);
			l.close(frame.hd_delim_end);
		}
		frame.i = frame.hd_resume;
	} else {
		// S_DQUOTE
		const r = scan_dquote_body(l, frame.i, frame.to);
		if (r < 0) {
			const j = ~r;
			frame.i = j;
			if (l.text.charCodeAt(j) === 96) mac_push_backtick(mac, j, frame.to);
			else mac_push_dollar_paren(mac, j, frame.to);
			return false;
		}
		l.close(r);
		frame.i = r;
	}
	frame.sub = S_NONE;
	return true;
};

/**
 * Runs (or resumes) a window frame — the core per-token scan. Maintains the
 * per-window queue of pending heredocs (redirected on the current line, bodies
 * consumed at the next newline). String and heredoc bodies scan inline; one
 * interrupted by a substitution records its submode, suspends, and is finished
 * by the `run_bash_sub` resume. Returns `true` when the window completes —
 * fully consumed, or terminated at its self-discovered `frame.term` delimiter
 * (position recorded in `frame.ret_a`) — or `false` after pushing a
 * substitution-interior frame, which the driver runs before resuming this
 * frame.
 */
const run_bash_window = (mac: BashMachine, frame: BashFrame): boolean => {
	const l = mac.l;
	const { text } = l;
	const to = frame.to;
	const term = frame.term;

	// resume an interrupted string/heredoc body scan before the main scan
	if (frame.sub !== S_NONE && !run_bash_sub(mac, frame)) return false;

	// resume mid-drain: finish the pending heredoc bodies before scanning
	if (frame.draining && !drain_pending(mac, frame)) return false;

	let i = frame.i;
	let prev_function_kw = frame.prev_function_kw;

	while (i < to) {
		const c = text.charCodeAt(i);

		if (c === 10) {
			i++;
			if (frame.pending.length > 0) {
				frame.i = i;
				frame.prev_function_kw = prev_function_kw;
				frame.draining = true;
				if (!drain_pending(mac, frame)) return false;
				i = frame.i;
			}
			continue;
		}
		if (is_space(c)) {
			i++;
			continue;
		}

		const fn = prev_function_kw;
		prev_function_kw = false;

		// shebang / comments
		if (c === 35) {
			if (i === 0 && text.charCodeAt(1) === 33) {
				const le = scan_to_line_end(text, i, to);
				l.leaf(T_SHEBANG, i, le);
				i = le;
				continue;
			}
			if (i === 0 || is_space(text.charCodeAt(i - 1))) {
				const le = scan_to_line_end(text, i, to);
				l.leaf(T_COMMENT, i, le);
				i = le;
				continue;
			}
			i++;
			continue;
		}

		// `$` expansions
		if (c === 36) {
			const c1 = text.charCodeAt(i + 1);
			if (c1 === 40) {
				frame.i = i;
				frame.prev_function_kw = prev_function_kw;
				mac_push_dollar_paren(mac, i, to);
				return false;
			}
			if (c1 === 39) {
				const e = scan_ansi_c(text, i, to);
				l.leaf(T_STRING, i, e);
				i = e;
				continue;
			}
			i = scan_dollar_var(l, i, to);
			continue;
		}

		// strings
		if (c === 34) {
			l.open(T_STRING, i);
			const r = scan_dquote_body(l, i + 1, to);
			if (r >= 0) {
				// no substitutions — the whole string completed inline
				l.close(r);
				i = r;
				continue;
			}
			// suspend mid-string: the submode resume finishes the body
			const j = ~r;
			frame.i = j;
			frame.sub = S_DQUOTE;
			frame.prev_function_kw = prev_function_kw;
			if (text.charCodeAt(j) === 96) mac_push_backtick(mac, j, to);
			else mac_push_dollar_paren(mac, j, to);
			return false;
		}
		if (c === 39) {
			const close = text.indexOf("'", i + 1);
			const e = close === -1 || close >= to ? to : close + 1;
			l.leaf(T_STRING, i, e);
			i = e;
			continue;
		}

		// legacy backtick command substitution
		if (c === 96) {
			frame.i = i;
			frame.prev_function_kw = prev_function_kw;
			mac_push_backtick(mac, i, to);
			return false;
		}

		// numbers and file descriptors
		if (is_digit(c)) {
			const next = text.charCodeAt(i + 1);
			if (next === 62 || next === 60) {
				// `\b\d(?=>>?|<)` — a single-digit file descriptor
				l.leaf(T_FILE_DESCRIPTOR, i, i + 1);
				i++;
				continue;
			}
			const num_end = scan_bash_number(text, i, to);
			if (!is_ascii_word(text.charCodeAt(num_end))) {
				l.leaf(T_NUMBER, i, num_end);
				i = num_end;
				continue;
			}
			// digit-led but part of a larger word — fall through to word handling
		}

		// words: function defs, keywords, builtins, booleans, else plain
		if (is_ascii_word(c)) {
			let wend = i + 1;
			while (wend < to && is_ascii_word(text.charCodeAt(wend))) wend++;
			if (fn) {
				l.leaf(T_FUNCTION, i, wend);
				i = wend;
				continue;
			}
			const a = skip_space(text, wend, to);
			if (text.charCodeAt(a) === 40 && text.charCodeAt(skip_space(text, a + 1, to)) === 41) {
				l.leaf(T_FUNCTION, i, wend); // `name()` definition
				i = wend;
				continue;
			}
			const word = text.slice(i, wend);
			const kind = WORDS.get(word);
			if (kind === K_KEYWORD) {
				l.leaf(T_KEYWORD, i, wend);
				if (word === 'function') prev_function_kw = true;
			} else if (kind === K_BUILTIN) {
				l.leaf(T_BUILTIN, i, wend);
			} else if (kind === K_BOOLEAN) {
				l.leaf(T_BOOLEAN, i, wend);
			}
			i = wend;
			continue;
		}

		// `<` — here-string, heredoc, or `<`/`<<` operator
		if (c === 60) {
			if (text.charCodeAt(i + 1) === 60) {
				if (text.charCodeAt(i + 2) === 60) {
					l.leaf(T_OPERATOR, i, i + 3); // `<<<`
					i += 3;
					continue;
				}
				const consumed = lex_bash_heredoc_start(mac, frame, i, to);
				if (consumed === -2) {
					// suspended mid-body at a substitution — the submode resume
					// finishes the heredoc
					frame.prev_function_kw = prev_function_kw;
					return false;
				}
				if (consumed !== -1) {
					i = consumed;
					continue;
				}
				l.leaf(T_OPERATOR, i, i + 2); // `<<` with no delimiter
				i += 2;
				continue;
			}
			l.leaf(T_OPERATOR, i, i + 1); // `<`
			i++;
			continue;
		}

		// `&d` file descriptor before the `&` operator forms
		if (
			c === 38 &&
			is_digit(text.charCodeAt(i + 1)) &&
			!is_ascii_word(text.charCodeAt(i + 2)) &&
			(i === 0 || !is_ascii_word(text.charCodeAt(i - 1)))
		) {
			l.leaf(T_FILE_DESCRIPTOR, i, i + 2);
			i += 2;
			continue;
		}

		// `;;` operator vs `;` punctuation
		if (c === 59) {
			if (text.charCodeAt(i + 1) === 59) {
				l.leaf(T_OPERATOR, i, i + 2);
				i += 2;
			} else {
				l.leaf(T_PUNCTUATION, i, i + 1);
				i++;
			}
			continue;
		}

		// `=` — plain, except `==` / `=~`
		if (c === 61) {
			const c1 = text.charCodeAt(i + 1);
			if (c1 === 126 || c1 === 61) {
				l.leaf(T_OPERATOR, i, i + 2);
				i += 2;
			} else {
				i++;
			}
			continue;
		}

		// operators
		if (c === 124 || c === 38 || c === 62 || c === 33) {
			const len = bash_operator_len(text, i, to, c);
			l.leaf(T_OPERATOR, i, i + len);
			i += len;
			continue;
		}

		// punctuation
		if (c === 123 || c === 125 || c === 91 || c === 93 || c === 40 || c === 41 || c === 44) {
			// self-discovery: a `)` at depth 0 ends the window (the driver's
			// finalize emits it); nested parens keep the depth counter honest —
			// parens inside strings/comments/heredoc bodies/child frames never
			// reach here
			if (c === term && --frame.depth === 0) {
				frame.ret_a = i;
				return true;
			}
			if (c === 40 && term !== 0) frame.depth++;
			l.leaf(T_PUNCTUATION, i, i + 1);
			i++;
			continue;
		}

		i++; // anything else is plain text
	}

	frame.i = i;
	frame.prev_function_kw = prev_function_kw;
	return true;
};

/**
 * Handles a `<<`/`<<-` heredoc redirect at `i`. Emits the opening delimiter and
 * either consumes the heredoc inline (when it is the sole redirect at the end
 * of the line) or queues it on `frame.pending` for draining at the next
 * newline. Returns the new position, -1 when no delimiter follows (the caller
 * emits `<<` as an operator), or -2 when the inline body hit a substitution
 * and the window suspended mid-body (the caller returns `false`).
 */
const lex_bash_heredoc_start = (
	mac: BashMachine,
	frame: BashFrame,
	i: number,
	to: number
): number => {
	const l = mac.l;
	const { text } = l;
	let k = i + 2;
	const dash = text.charCodeAt(k) === 45;
	if (dash) k++; // `<<-`
	k = skip_blank(text, k, to);
	let quote = 0;
	if (text.charCodeAt(k) === 39 || text.charCodeAt(k) === 34) {
		quote = text.charCodeAt(k);
		k++;
	}
	const dstart = k;
	while (k < to && is_ascii_word(text.charCodeAt(k))) k++;
	if (k === dstart) return -1; // no delimiter word
	const delim = text.slice(dstart, k);
	let delim_token_end = k;
	if (quote !== 0 && text.charCodeAt(k) === quote) delim_token_end = k + 1;

	const after = skip_blank(text, delim_token_end, to);
	const contiguous = after >= to || text.charCodeAt(after) === 10;
	const quoted = quote !== 0;

	// non-contiguous, or another heredoc already queued: defer the body so the
	// queued order (first redirect → first body) is preserved
	if (!contiguous || frame.pending.length > 0) {
		l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
		frame.pending.push({ delim, quoted, dash });
		return delim_token_end;
	}

	// contiguous single heredoc — one container from opener to closing delimiter
	if (after >= to) {
		l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
		return delim_token_end;
	}
	const body_start = after + 1; // past the newline
	// the window resumes at the closing delimiter's end; the rest of its line
	// (the newline) scans normally
	l.open(T_HEREDOC, i);
	l.leaf(T_HEREDOC_DELIMITER, i, delim_token_end);
	frame.hd_delim = delim;
	frame.hd_quoted = quoted;
	frame.hd_inline = true;
	frame.hd_dash = dash;
	const r = scan_heredoc_body(l, frame, body_start);
	if (r < 0) {
		// the body hit a substitution — suspend mid-body; the submode resume
		// finishes it
		frame.sub = S_HEREDOC;
		mac_push_dollar_paren(mac, ~r, to);
		return -2;
	}
	if (frame.hd_delim_start === -1) {
		l.close(to);
	} else {
		l.leaf(T_HEREDOC_DELIMITER, frame.hd_delim_start, frame.hd_delim_end);
		l.close(frame.hd_delim_end);
	}
	return frame.hd_resume;
};

/**
 * Drives the explicit frame stack to completion: runs the top frame, and when
 * it finishes, pops it and finalizes it into the frame beneath — emitting the
 * construct's trailing events and advancing that frame past the consumed
 * region. A frame that pushes a child returns `false`, so the child runs next
 * and this frame resumes only once the child (and its own descendants) have
 * completed.
 */
const run_bash = (mac: BashMachine): void => {
	const l = mac.l;
	while (mac.sp > 0) {
		const frame = mac.stack[mac.sp - 1]!;
		if (!run_bash_window(mac, frame)) continue; // a child was pushed — run it first
		mac.sp -= 1;
		const ret = frame.ret;
		if (ret === R_ROOT) continue;
		const parent = mac.stack[mac.sp - 1]!;
		const close = frame.ret_a;
		if (ret === R_ARITH) {
			if (close === -1) {
				parent.i = frame.to; // unterminated
			} else {
				// the second `)` of a well-formed `))` — the interior emitted the
				// first as punctuation, so emit-time coalescing reforms one leaf
				l.leaf(T_PUNCTUATION, close, close + 1);
				parent.i = close + 1;
			}
		} else if (close === -1) {
			// unterminated `$(…)`/backtick — the container extends to the window end
			l.close(frame.to);
			parent.i = frame.to;
		} else {
			l.leaf(T_PUNCTUATION, close, close + 1); // `)` or the closing backtick
			l.close(close + 1);
			parent.i = close + 1;
		}
	}
};

const lex_bash = (l: Lexer): void => {
	const mac: BashMachine = { l, stack: [], sp: 0 };
	mac_push_window(mac, l.pos, l.end, R_ROOT, 0, 0, 0);
	run_bash(mac);
	l.pos = l.end;
};

/**
 * The shell (bash-family) language registration for the lexer engine.
 *
 * Registered as `sh`; `bash` and `shell` alias it: POSIX sh is a syntactic
 * subset of bash for highlighting purposes, and the bash-only constructs this
 * lexer additionally recognizes don't occur in sh input, so running it on sh
 * scripts is exact. There is no separate sh lexer.
 */
export const lexer_bash: SyntaxLang = { id: 'sh', aliases: ['bash', 'shell'], lex: lex_bash };
