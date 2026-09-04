import type { Tome } from "@fuzdev/fuz_ui/tome.ts";
import IntroductionPage from "./introduction/+page.svelte";
import PlaygroundPage from "./playground/+page.svelte";
import BenchmarksPage from "./benchmarks/+page.svelte";

export const tomes: Array<Tome> = [
  {
    slug: "introduction",
    category: "guide",
    Component: IntroductionPage,
    related_tomes: ["playground", "benchmarks"],
    related_modules: [],
    related_declarations: [],
  },
  {
    slug: "playground",
    category: "guide",
    Component: PlaygroundPage,
    related_tomes: ["introduction", "benchmarks"],
    related_modules: [],
    related_declarations: [],
  },
  {
    slug: "benchmarks",
    category: "guide",
    Component: BenchmarksPage,
    related_tomes: ["introduction", "playground"],
    related_modules: [],
    related_declarations: [],
  },
];
