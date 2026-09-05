# corpora

> pinned snapshot of real-code corpora for the fuz ecosystem's language tools.

This is a data repo, not a package, and it's AI-generated and may be low quality.
It vendors the source of real-world projects, one collection per upstream repo,
every collection pinned at one roll-up commit, so that a
tool's benchmarks, conformance gates and PGO training all name one SHA and anyone can
reproduce their numbers with one clone.

First consumer: [tsv](https://github.com/fuzdev/tsv), whose corpus gates and benchmarks
read `collections/` in place of a dozen live sibling checkouts.

## Layout

```
manifest.json     which upstreams, at which commit, filtered how (the recipe)
lock.json         per collection: commit, file count, bytes, content digest (generated)
collections/      the snapshot — one directory per upstream, upstream-relative paths, verbatim bytes
  <name>/LICENSE  the upstream's license, or a note naming its package.json declaration
scripts/          the Deno materializer (zero dependencies; git via subprocess)
```

Point a consumer at `collections/<name>`, never at the repo root: the tree under a
collection holds only corpus files, so every tool's discovery sees the same set.

## What belongs

**Code as people write it.** Application, library and framework source, under a
permissive license, with the upstream's own test fixtures left out — and, with them,
any third-party bundle an upstream vendors into its tree (a copied highlighter's
language and theme files): real files in that repo, but not code its authors wrote.
Both are named per collection in the manifest's `exclude`. Not:

- **Conformance suites** — test262, the TypeScript compiler's `tests/cases`, wpt,
  Svelte's and prettier's test suites. Each is consumed whole with its own harness
  semantics, is coupled to the oracle that grades it, and is already reproducible from
  one upstream repo; consumers read those checkouts directly.
- **Anything not redistributable.** Every collection must carry a permissive license the
  materializer can verify (MIT, Apache-2.0, BSD, ISC, 0BSD, Unlicense, CC0).
- **Verdicts.** What a formatter or parser says about these files stays in the consumer,
  keyed on this repo's commit.

Each collection is tagged `shaped_by` (`tsv`, `prettier`, `none`): who last formatted
it. A formatter benchmarked on code it already shaped measures its idempotent path, so
consumers can select a fair subset.

## Usage

```bash
deno task materialize                 # rewrite collections/ + lock.json from manifest.json
deno task materialize --only kit      # one collection (others keep their lock entries)
deno task check                       # re-materialize to a temp dir; fail on any byte of drift or a leftover collection
deno task test && deno task typecheck
```

The materializer reads git objects, never a working tree: `git ls-tree` at the pinned
commit lists the files, `git cat-file --batch` copies their bytes. A sibling checkout
(`../<name>`) is used when it holds the commit; otherwise the commit is fetched shallowly
into the gitignored `.cache/repos/`, which is how CI runs.

Never format a collection in place. Copy it, or `git checkout -- collections` afterwards.

## Refreshing

1. Edit the commits (and any new collections) in `manifest.json`.
2. `deno task materialize`, then review the diffstat.
3. Commit with the per-collection commit ranges in the message. The new commit is the
   roll-up hash a reader clones; what consumers pin is the `collections/` tree id
   (`git rev-parse HEAD:collections`), which a refresh moves and a scripts or docs commit
   here does not — each re-pins its counts against it, so refreshes are deliberate and
   unscheduled.

## License

The materializer and this repo's own files are MIT (see [LICENSE](./LICENSE)). Each
collection is the upstream's work under the upstream's license, kept beside it in
`collections/<name>/LICENSE`.
