// A single Svelte source that embeds all three languages tsv handles —
// TypeScript in `<script lang="ts">`, the Svelte template, and CSS in `<style>` —
// so one example exercises the whole formatter and parser. Deliberately messy so
// the first format visibly cleans it up. (Safe to keep the `</script>`/`</style>`
// literally here: this is a `.ts` module, not a `.svelte` file, so the Svelte
// compiler never parses the string.)
export const playground_example = `<script lang="ts">
let count=$state(0)
const doubled=$derived(count*2)
const increment=()=>{count+=1}
</script>

<button onclick={ increment  }>clicks: {
count}</button>
<p>doubled: {doubled } </p>

<style>
button{color:var(--text_color)}
   p{font-weight:700}
</style>
`;
