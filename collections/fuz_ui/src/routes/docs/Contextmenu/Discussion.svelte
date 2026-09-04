<script lang="ts">
	import MdnLink from '$lib/MdnLink.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import RootComponentSelector from './RootComponentSelector.svelte';
</script>

<TomeSection>
	<TomeSectionHeader text="iOS compatibility" />
	<p>
		Fuz provides two versions of the contextmenu root component with different tradeoffs due to iOS
		Safari not supporting the <code>contextmenu</code> event as of October 2025, see
		<a href="https://bugs.webkit.org/show_bug.cgi?id=213953">WebKit bug #213953</a>.
	</p>
	<p>
		Use <DeclarationLink name="ContextmenuRoot" /> by default for better performance and haptic
		feedback. Use
		<DeclarationLink name="ContextmenuRootForSafariCompatibility" />
		only if you need iOS Safari support.
	</p>
	<h4>ContextmenuRoot</h4>
	<ul>
		<li>standard, default implementation</li>
		<li>
			relies on the browser's <MdnLink path="Web/API/Element/contextmenu_event">
				<span class="font_family_mono">contextmenu</span> event
			</MdnLink>
		</li>
		<li>
			much simpler, better performance with fewer and less intrusive event handlers, fewer edge
			cases that can go wrong
		</li>
		<li>
			does not work on iOS Safari until
			<a href="https://bugs.webkit.org/show_bug.cgi?id=213953">WebKit bug #213953</a>
			is fixed
		</li>
	</ul>
	<h4>ContextmenuRootForSafariCompatibility</h4>
	<ul>
		<li>opt-in hacky alternative when iOS support is needed</li>
		<li>
			implements custom longpress detection to work around iOS Safari's lacking
			<a href="https://bugs.webkit.org/show_bug.cgi?id=213953">
				<code>contextmenu</code> event support
			</a>
		</li>
		<li>
			degraded experience because some browsers (including mobile Chrome) block
			<code>navigator.vibrate</code>
			haptic feedback due to the timeout-based gesture detection (because it's not a direct user
			action)
		</li>
		<li>works on all devices including iOS Safari</li>
		<li>
			more complex implementation with custom touch event handling and gesture detection, may cause
			edge case UX problems on some devices
		</li>
		<li>a longpress is cancelled if you move the touch past a threshold before it triggers</li>
		<li>opt into this version only if you need iOS Safari support</li>
	</ul>
	<RootComponentSelector />
</TomeSection>
<TomeSection>
	<TomeSectionHeader text="Caveats" />
	<p>
		The Fuz contextmenu provides powerful app-specific UX, but it breaks from normal browser
		behavior by replacing the system contextmenu.
	</p>
	<p>To mitigate the downsides:</p>
	<ul>
		<li>
			The Fuz contextmenu only replaces the system contextmenu when the DOM tree has defined
			behaviors. Note that <code>a</code> links have default contextmenu behaviors unless disabled.
			Other interactive elements may have default behaviors added in the future.
		</li>
		<li>
			The Fuz contextmenu does not open on elements that allow clipboard pasting like inputs,
			textareas, and contenteditables -- however this may change for better app integration, or be
			configurable.
		</li>
		<li>To bypass on devices with a keyboard, hold Shift while rightclicking.</li>
		<li>
			To bypass on touch devices (e.g. to select text), use tap-then-longpress instead of longpress.
		</li>
		<li>Triggering the contextmenu inside the Fuz contextmenu shows the system contextmenu.</li>
	</ul>
	<p>
		See also the <MdnLink path="Web/API/Element/contextmenu_event" /> docs and the
		<a href="https://www.w3.org/TR/uievents/#event-type-contextmenu">w3 spec</a>.
	</p>
</TomeSection>
