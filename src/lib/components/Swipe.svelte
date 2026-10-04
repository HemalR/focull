<script lang="ts">
	import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { Duel, type DuelProps } from '$lib/duel.svelte';
	import { onKey, type Action } from '$lib/keymap.svelte';
	import { fullsizeUrl, playbackUrl, previewUrl, thumbnailUrl } from '$lib/immich';
	import { session } from '$lib/session.svelte';
	import { thumbhashStyle } from '$lib/thumbhash';
	import AlbumPalette from './AlbumPalette.svelte';
	import LocationPalette from './LocationPalette.svelte';
	import Carousel from './Carousel.svelte';
	import ExifStrip from './ExifStrip.svelte';

	/**
	 * Touch battle deck. The challenger is a card you swipe; the one to beat sits in an inset.
	 * Hold the card to see the one to beat in its place (blink comparison), double-tap to zoom.
	 */
	const props: DuelProps = $props();
	const duel = new Duel(() => props);
	const tally = $derived(session.tally);
	const groupAlbum = $derived(session.groupAlbum());

	type Dir = 'left' | 'right' | 'up' | 'down';
	interface Outcome {
		/** The keyboard action that throws the card this way. */
		action: Action;
		label: string;
		icon: string;
		tone: 'rej' | 'keep' | 'amber' | 'reel';
		run: () => void;
	}

	/**
	 * What each swipe does — also drives the button row and keys. Right is the safe "yes":
	 * keeping never culls anything. Crowning culls the old champion, so it takes the deliberate
	 * flick up onto the inset.
	 */
	const outcomes = $derived.by((): Partial<Record<Dir, Outcome>> => {
		if (duel.isSingle) {
			return {
				left: { action: 'cull', label: 'cull', icon: '✕', tone: 'rej', run: () => duel.decideSingle(false) },
				right: { action: 'keep', label: 'keep', icon: '✓', tone: 'keep', run: () => duel.decideSingle(true) }
			};
		}
		return {
			left: { action: 'defend', label: 'cull', icon: '✕', tone: 'rej', run: () => duel.decide('defend') },
			...(duel.canReel && {
				down: { action: 'reel', label: 'reel', icon: '◉', tone: 'reel', run: () => duel.decide('reel') }
			}),
			up: { action: 'dethrone', label: 'crown', icon: '◆', tone: 'amber', run: () => duel.decide('dethrone') },
			right: { action: 'keepBoth', label: 'keep', icon: '✓', tone: 'keep', run: () => duel.decide('keepBoth') }
		};
	});
	const BUTTON_ORDER: Dir[] = ['left', 'down', 'up', 'right'];

	/** Fraction of the card a drag must travel to count, or a flick speed (px/ms) that also counts. */
	const DISTANCE = 0.28;
	const FLICK_SPEED = 0.6;
	const SLOP_PX = 10;
	const HOLD_MS = 280;
	const FLY_MS = 180;
	const ZOOM = 2.5;

	let w = $state(1);
	let h = $state(1);
	let drag = $state({ x: 0, y: 0 });
	let dragging = $state(false);
	let holding = $state(false);
	/** Peek pinned by tapping the inset — tied to one challenger, so it lapses when that changes. */
	let pinnedId = $state<string | null>(null);
	let flying = $state<Dir | null>(null);
	/** One frame without transitions, so the next card appears in place instead of sliding back. */
	let instant = $state(false);

	const peeking = $derived(
		!duel.isSingle && (holding || (pinnedId !== null && pinnedId === duel.challenger?.id))
	);
	const front = $derived(duel.isSingle ? duel.champion : duel.challenger);
	/** What the card currently shows — the album palette stages this one. */
	const shown = $derived(peeking ? duel.champion : front);
	const enabled = $derived(duel.keysActive && flying === null);
	const zoomTransform = $derived(duel.zoomed ? `scale(${ZOOM})` : undefined);

	const dirOf = ({ x, y }: { x: number; y: number }): Dir =>
		Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';

	/** How far along a drag is towards committing (0..1+), relative to the card's size on that axis. */
	const reach = ({ x, y }: { x: number; y: number }): number =>
		Math.abs(x) >= Math.abs(y) ? Math.abs(x) / w / DISTANCE : Math.abs(y) / h / DISTANCE;

	/** The stamp on the card while dragging (or flying): what letting go would do. */
	const intent = $derived.by(() => {
		if (flying) return outcomes[flying] && { ...outcomes[flying], strength: 1 };
		if (!dragging) return null;
		const outcome = outcomes[dirOf(drag)];
		return outcome && { ...outcome, strength: Math.min(reach(drag), 1) };
	});

	const transform = $derived.by(() => {
		if (flying === 'up') return `translate(${-w * 0.36}px, ${-h * 0.42}px) scale(0.2)`;
		if (flying) {
			const off = { left: [-1.3 * w, 0], right: [1.3 * w, 0], down: [0, 1.3 * h] }[flying];
			return `translate(${off[0]}px, ${off[1]}px) rotate(${(off[0] / w) * 12}deg)`;
		}
		return `translate(${drag.x}px, ${drag.y}px) rotate(${(drag.x / w) * 12}deg)`;
	});

	/** Throw the card off in a direction, then apply that outcome once it's gone. */
	function fling(dir: Dir) {
		const outcome = outcomes[dir];
		if (!outcome || !enabled) {
			drag = { x: 0, y: 0 };
			return;
		}
		flying = dir;
		navigator.vibrate?.(8);
		setTimeout(() => {
			outcome.run();
			instant = true;
			flying = null;
			drag = { x: 0, y: 0 };
			requestAnimationFrame(() => (instant = false));
		}, FLY_MS);
	}

	let gesture: { x: number; y: number; t: number; pan: { x: number; y: number }; moved: boolean } | null =
		null;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let lastTap = 0;

	function onpointerdown(e: PointerEvent) {
		if (!enabled || !e.isPrimary) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		gesture = { x: e.clientX, y: e.clientY, t: e.timeStamp, pan: { ...duel.pan }, moved: false };
		clearTimeout(holdTimer);
		if (!duel.isSingle) holdTimer = setTimeout(() => (holding = true), HOLD_MS);
	}

	function onpointermove(e: PointerEvent) {
		if (!gesture) return;
		const dx = e.clientX - gesture.x;
		const dy = e.clientY - gesture.y;
		if (!gesture.moved && Math.hypot(dx, dy) > SLOP_PX) {
			gesture.moved = true;
			clearTimeout(holdTimer);
		}
		if (!gesture.moved || holding) return;
		if (duel.zoomed) {
			// Zoomed, one finger pans: the zoom focus moves against the finger, scaled by the zoom.
			const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
			duel.pan = {
				x: clamp(gesture.pan.x - dx / ((ZOOM - 1) * w)),
				y: clamp(gesture.pan.y - dy / ((ZOOM - 1) * h))
			};
		} else {
			// Swipes judge the challenger, so it must be what's on the card.
			pinnedId = null;
			dragging = true;
			drag = { x: dx, y: dy };
		}
	}

	function onpointerup(e: PointerEvent) {
		const g = gesture;
		gesture = null;
		clearTimeout(holdTimer);
		if (!g) return;
		if (holding) {
			holding = false;
			return;
		}
		if (!g.moved) return tap(e);
		if (!dragging) return; // a zoomed pan ended
		dragging = false;
		const dist = Math.hypot(drag.x, drag.y);
		const flick = dist > 40 && dist / (e.timeStamp - g.t) > FLICK_SPEED;
		if (reach(drag) >= 1 || flick) fling(dirOf(drag));
		else drag = { x: 0, y: 0 }; // spring back
	}

	function onpointercancel() {
		gesture = null;
		clearTimeout(holdTimer);
		holding = false;
		dragging = false;
		drag = { x: 0, y: 0 };
	}

	/** Double-tap toggles zoom, focused where you tapped. */
	function tap(e: PointerEvent) {
		if (e.timeStamp - lastTap > 300) {
			lastTap = e.timeStamp;
			return;
		}
		lastTap = 0;
		if (!duel.zoomed) {
			const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
			duel.pan = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
		}
		duel.zoomed = !duel.zoomed;
	}

	function togglePin() {
		const id = duel.challenger?.id;
		if (id) pinnedId = pinnedId === id ? null : id;
	}

	/** Close the menu, then do the thing. */
	const fromMenu = (action: () => void) => () => {
		duel.setOverlay(null);
		action();
	};

	// Decision keys mean the same as in the side-by-side battle; here they throw the card.
	const dirOfAction = (action: Action) => BUTTON_ORDER.find((dir) => outcomes[dir]?.action === action);
	for (const action of ['defend', 'dethrone', 'keepBoth', 'reel', 'keep', 'cull'] as const) {
		onKey(
			action,
			() => {
				const dir = dirOfAction(action);
				if (dir) fling(dir);
			},
			() => ({ enabled: enabled && dirOfAction(action) !== undefined })
		);
	}
	createHotkey('Escape', () => duel.setOverlay(null), () => ({
		enabled: duel.overlay === 'menu',
		conflictBehavior: 'allow'
	}));
</script>

{#snippet layer(asset: AssetResponseDto, visible: boolean)}
	{#key asset.id}
		<div class={['layer', !visible && 'hidden']}>
			{#if asset.type === AssetTypeEnum.Video}
				{#if visible}
					<video
						src={playbackUrl(asset.id)}
						autoplay
						loop
						playsinline
						muted={duel.muted}
						poster={previewUrl(asset.id)}
						style={thumbhashStyle(asset, 'contain')}
						style:transform={zoomTransform}
					></video>
				{/if}
			{:else}
				<img
					src={previewUrl(asset.id)}
					alt={asset.originalFileName}
					draggable="false"
					style={thumbhashStyle(asset, 'contain')}
					style:transform={zoomTransform}
				/>
				{#if duel.zoomed}
					<img src={fullsizeUrl(asset.id)} alt="" draggable="false" style:transform={zoomTransform} />
				{/if}
			{/if}
		</div>
	{/key}
{/snippet}

<div class="deck">
	<header class="top">
		<span class="mono muted">{session.gi + 1}/{session.groups.length}</span>
		<span class="label where">{duel.label}</span>
		<button
			type="button"
			class={['album', 'mono', !groupAlbum && 'none']}
			aria-label="album for this group onward"
			onclick={() => duel.setOverlay('album')}
		>
			◇{groupAlbum ? ` ${groupAlbum.name}` : ''}
		</button>
		<span class="tallies mono">
			<span class="t-keep">✓ {tally.kept}</span>
			<span class="t-rej">✕ {tally.culled}</span>
		</span>
		<button type="button" class="more" aria-label="menu" onclick={() => duel.setOverlay('menu')}>⋯</button>
	</header>

	<main class="stage" bind:clientWidth={w} bind:clientHeight={h}>
		{#if front}
			<div
				class={['card', (dragging || instant) && 'still']}
				style:transform
				style:opacity={flying === 'up' ? 0 : 1}
				style:--px="{duel.pan.x * 100}%"
				style:--py="{duel.pan.y * 100}%"
				role="application"
				aria-label="swipe: left cull, right keep{duel.isSingle ? '' : ', up crown'}"
				{onpointerdown}
				{onpointermove}
				{onpointerup}
				{onpointercancel}
				oncontextmenu={(e) => e.preventDefault()}
			>
				{#if duel.champion && !duel.isSingle && (peeking || duel.champion.type !== AssetTypeEnum.Video)}
					{@render layer(duel.champion, peeking)}
				{/if}
				{@render layer(front, !peeking)}
				{#if peeking}
					<span class="peek-tag mono">◆ the one to beat</span>
				{/if}
				{#if intent}
					<span class={['stamp', intent.tone]} style:opacity={intent.strength}>{intent.label}</span>
				{/if}
			</div>
		{/if}

		{#if duel.champion && front && !duel.isSingle}
			{@const other = peeking ? front : duel.champion}
			<button type="button" class={['inset', peeking && 'swapped']} onclick={togglePin}>
				<img src={thumbnailUrl(other.id)} alt="" style={thumbhashStyle(other)} />
				<span class="tag mono">{peeking ? 'challenger' : '◆ to beat'}</span>
			</button>
		{/if}

		{#if duel.group?.kind === 'video'}
			<button type="button" class="mute mono" onclick={() => (duel.muted = !duel.muted)}>
				{duel.muted ? '♪ unmute' : '♪ mute'}
			</button>
		{/if}

		{#if !duel.isSingle && session.decisionCount < 5}
			<p class="hint mono">hold to compare · double-tap to zoom</p>
		{/if}
	</main>

	{#if shown}
		<ExifStrip asset={shown} />
	{/if}

	{#if duel.group && duel.state && !duel.isSingle}
		<Carousel
			group={duel.group}
			state={duel.state}
			onJump={(idx) => enabled && session.jumpTo(idx)}
		/>
	{/if}

	<nav class="actions">
		<button type="button" class="act small" onclick={duel.undo}>
			<span class="icon">↶</span>undo
		</button>
		{#each BUTTON_ORDER as dir (dir)}
			{@const outcome = outcomes[dir]}
			{#if outcome}
				<button type="button" class={['act', outcome.tone]} disabled={!enabled} onclick={() => fling(dir)}>
					<span class="icon">{outcome.icon}</span>{outcome.label}
				</button>
			{/if}
		{/each}
	</nav>
</div>

{#if duel.overlay === 'menu'}
	<div class="sheet-wrap">
		<button type="button" class="backdrop" aria-label="close menu" onclick={() => duel.setOverlay(null)}
		></button>
		<div class="card sheet" role="menu">
			<button type="button" role="menuitem" onclick={() => duel.setOverlay('album')}>
				◇ album for this group onward{groupAlbum ? `: ${groupAlbum.name}` : ''}
			</button>
			<button type="button" role="menuitem" onclick={() => duel.setOverlay('albumPhoto')}>
				◇ just this photo — add to / remove from an album
			</button>
			<button type="button" role="menuitem" onclick={() => duel.setOverlay('location')}>
				⌖ location for photos here without one
			</button>
			<button type="button" role="menuitem" onclick={() => duel.setOverlay('locationPhoto')}>
				⌖ location for just this photo
			</button>
			<button type="button" role="menuitem" onclick={fromMenu(() => (duel.zoomed = !duel.zoomed))}>
				⌕ {duel.zoomed ? 'zoom out' : 'zoom in'}
			</button>
			<button type="button" role="menuitem" onclick={fromMenu(duel.skip)}>
				⤼ skip this scene — stays unreviewed
			</button>
			<button type="button" role="menuitem" onclick={fromMenu(props.onReview)}>
				✓ review & commit what's done
			</button>
			<button type="button" role="menuitem" onclick={fromMenu(props.onHelp)}>? gestures & keys</button>
			<button type="button" role="menuitem" onclick={fromMenu(props.onExit)}>← back to sessions</button>
		</div>
	</div>
{/if}

{#if duel.albumScope && shown}
	<AlbumPalette
		scope={duel.albumScope}
		asset={shown}
		notify={props.notify}
		onClose={() => duel.setOverlay(null)}
	/>
{/if}

{#if duel.locationScope && shown}
	<LocationPalette scope={duel.locationScope} asset={shown} onClose={() => duel.setOverlay(null)} />
{/if}

<style>
	.deck {
		height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto auto auto;
		padding-bottom: env(safe-area-inset-bottom);
		user-select: none;
		-webkit-user-select: none;
	}

	.top {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: calc(6px + env(safe-area-inset-top)) 8px 6px 12px;
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		font-size: 12px;
	}

	.album {
		flex-shrink: 1;
		max-width: 32vw;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 2px 7px;
		border: 1px solid var(--amber-dim);
		border-radius: 4px;
		color: var(--amber);
		font-size: 11px;
	}

	.album.none {
		border-color: var(--line);
		color: var(--mut);
	}

	.where {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.tallies {
		margin-left: auto;
		display: flex;
		gap: 10px;
	}

	.t-keep {
		color: var(--keep);
	}

	.t-rej {
		color: var(--rej);
	}

	.more {
		font-size: 22px;
		line-height: 1;
		padding: 4px 10px;
		color: var(--ink);
	}

	.stage {
		position: relative;
		min-height: 0;
		overflow: hidden;
	}

	.card {
		position: absolute;
		inset: 8px;
		border-radius: 10px;
		overflow: hidden;
		background: #000;
		touch-action: none;
		-webkit-touch-callout: none;
		cursor: grab;
		transition:
			transform 180ms ease-out,
			opacity 180ms ease-out;
	}

	.card.still {
		transition: none;
	}

	.layer {
		position: absolute;
		inset: 0;
		animation: appear 160ms ease-out;
	}

	.layer.hidden {
		visibility: hidden;
	}

	.layer img,
	.layer video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		transform-origin: var(--px) var(--py);
		pointer-events: none;
		-webkit-touch-callout: none;
	}

	.peek-tag {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		padding: 3px 10px;
		border-radius: 12px;
		background: rgb(0 0 0 / 0.65);
		color: var(--amber);
		font-size: 11px;
		pointer-events: none;
	}

	.stamp {
		position: absolute;
		top: 38%;
		left: 50%;
		transform: translate(-50%, -50%) rotate(-8deg);
		padding: 6px 16px;
		border: 3px solid currentColor;
		border-radius: 8px;
		background: rgb(0 0 0 / 0.35);
		font: 700 24px var(--mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		pointer-events: none;
	}

	.inset {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 2;
		width: 26%;
		max-width: 150px;
		aspect-ratio: 4 / 3;
		border: 2px solid var(--amber);
		border-radius: 8px;
		overflow: hidden;
		background: #000;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.5);
		padding: 0;
	}

	.inset.swapped {
		border-color: var(--ink);
	}

	.inset img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.inset .tag {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 1px 0;
		background: rgb(0 0 0 / 0.65);
		color: var(--amber);
		font-size: 10px;
	}

	.inset.swapped .tag {
		color: var(--ink);
	}

	.mute {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 2;
		padding: 6px 10px;
		border-radius: 4px;
		background: rgb(0 0 0 / 0.65);
		border: 1px solid var(--line);
		font-size: 12px;
	}

	.hint {
		position: absolute;
		bottom: 14px;
		left: 0;
		right: 0;
		margin: 0;
		text-align: center;
		font-size: 11px;
		color: var(--mut);
		pointer-events: none;
		text-shadow: 0 1px 3px #000;
	}

	.rej {
		color: var(--rej);
	}

	.keep {
		color: var(--keep);
	}

	.amber {
		color: var(--amber);
	}

	.reel {
		color: var(--reel);
	}

	.actions {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: min(18px, 3vw);
		padding: 10px 12px 12px;
		border-top: 1px solid var(--line);
		background: var(--panel);
	}

	.act {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-family: var(--mono);
		font-size: 11px;
	}

	.act .icon {
		display: grid;
		place-items: center;
		width: min(58px, 15vw);
		height: min(58px, 15vw);
		border: 2px solid currentColor;
		border-radius: 50%;
		background: var(--panel2);
		font-size: 22px;
	}

	.act.small {
		color: var(--mut);
	}

	.act.small .icon {
		width: min(44px, 11vw);
		height: min(44px, 11vw);
		font-size: 18px;
		border-width: 1px;
	}

	.act:disabled {
		opacity: 0.5;
	}

	.act:active .icon {
		transform: scale(0.94);
	}

	.sheet-wrap {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgb(0 0 0 / 0.55);
		cursor: default;
	}

	.sheet {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
		border-radius: 12px 12px 0 0;
		animation: rise 160ms ease-out;
	}

	.sheet button {
		padding: 14px 16px;
		text-align: left;
		border-radius: 6px;
		font-size: 15px;
	}

	.sheet button:active {
		background: var(--panel2);
	}

	@keyframes appear {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
	}

	@keyframes rise {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
	}
</style>
