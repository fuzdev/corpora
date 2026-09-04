# corpora

> Pinned snapshot of real-code corpora for the fuz ecosystem's language tools.

A data repo, not a package. It vendors the source of real-world projects — one
collection per upstream repo, every collection pinned at one roll-up commit — so that
a tool's benchmarks, conformance gates and PGO training all name one SHA and anyone
can reproduce their numbers with one clone. First consumer: [tsv](https://github.com/fuzdev/tsv).

## Committing

`git add` and `git commit` are pre-approved in this repo — commit at sensible
stopping points with short 1-liner messages using `feat:` / `fix:` / `docs:` /
`chore:` prefixes; no body, no trailers. A corpus refresh is always its own commit:
its message carries the per-collection commit ranges and the diffstat, because every
consumer re-pins its counts against the new roll-up SHA.

## Layout

```
corpora/
├── manifest.json     # collections: name, url, commit, subpaths, include, exclude, license, shaped_by
├── lock.json         # per collection: commit, file count, bytes, content digest (generated)
├── scripts/          # the Deno materializer + check (zero external deps; git via subprocess)
│   ├── materialize.ts      # CLI: write mode, `--check`, `--only <name>`
│   └── lib/                # manifest (types + validation), git, source (sibling or .cache clone), snapshot
├── .cache/           # gitignored: bare clones fetched at the pinned commits when no sibling has them
└── collections/
    └── <name>/       # LICENSE + the upstream-relative source tree, verbatim bytes
```

Consumers point at `collections/<name>`, never at the repo root — the tree they walk
holds only corpus files.

## Commands

```bash
deno task materialize              # rewrite collections/ + lock.json from manifest.json
deno task materialize --only kit   # one collection; the others keep their lock entries
deno task check                    # re-materialize into a temp dir, compare byte for byte + lock; exit 1 on drift
deno task typecheck && deno task test
tsv format scripts                 # the repo's own TS — never `tsv format .` (it would walk collections/)
```

`deno task check` is what CI runs (`.github/workflows/check.yml`). It is also the
license gate: a collection whose license file or declaration does not read as its
manifest SPDX id fails inside it.

## Rules

- **Verbatim bytes.** `.gitattributes` declares `* -text`; nothing here is ever
  formatted, and no ignore files live under `collections/`, so every tool's discovery
  sees every file. Never format a collection in place; copy it, or `git checkout --`
  it afterwards.
- **Materialized from git objects** — `git ls-tree -r <commit> -- <subpath>` lists, `git
  cat-file --batch` copies — filtered by the manifest's extension allowlist and excludes.
  Never from a directory walk of a live checkout, never from a consumer's own discovery.
  Symlinks are skipped (a snapshot holds bytes, not links); a collection that matches no
  file fails.
- **Code as people write it.** Upstream test fixtures are excluded by the upstream's
  own meaning; conformance suites (test262, the TypeScript compiler's cases, wpt,
  Svelte's and prettier's test suites) do not belong here — consumers read those
  checkouts directly.
- **Redistributable only.** Every collection carries its upstream LICENSE (or names
  the manifest field it was read from) and must be permissive; the materializer
  refuses anything else.
- **No oracle verdicts.** What a formatter or parser says about these files stays in
  the consumer, keyed on this repo's SHA.
- **Refreshes are deliberate.** No scheduled auto-refresh; CI only checks that
  re-materializing at the manifest's commits reproduces the tree byte for byte, that
  every collection is licensed, and that the lock matches.
