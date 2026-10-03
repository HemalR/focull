<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { Duel, type DuelAction, type DuelProps } from '$lib/duel.svelte';
	import { session } from '$lib/session.svelte';
	import AlbumPalette from './AlbumPalette.svelte';
	import Pane from './Pane.svelte';
	import Carousel from './Carousel.svelte';
	import KeyLegend, { type LegendItem } from './KeyLegend.svelte';

	/** Keyboard-first side-by-side battle: champion pane left, challenger pane right. */
	const props: DuelProps = $props();
	const duel = new Duel(() => props);
	const tally = $derived(session.tally);

	type Side = 'champion' | 'challenger';
	/** Momentary full screen: the pane held up to your face while its key is down. */
	let lifted = $state<Side | null>(null);
	const holdUp = (key: 'ArrowUp' | 'ArrowDown', pane: Side) => {
		createHotkey(key, () => (lifted ??= duel.isSingle ? 'champion' : pane), () => ({
			enabled: duel.keysActive
		}));
		createHotkey(key, () => (lifted = null), { eventType: 'keyup', conflictBehavior: 'allow' });
	};
	holdUp('ArrowUp', 'challenger');
	holdUp('ArrowDown', 'champion');

	// Spatial keys: pick the pane on that side — or, while one is lifted, flip to that side.
	const side = (pane: Side, action: DuelAction) => () => (lifted ? (lifted = pane) : duel.decide(action));
	createHotkey('ArrowLeft', side('champion', 'defend'), () => ({ enabled: duel.dueling }));
	createHotkey('ArrowRight', side('challenger', 'dethrone'), () => ({ enabled: duel.dueling }));

	const toggleZoom = () => (duel.zoomed = !duel.zoomed);
	/**
	 * Shift held → magnifier loupe. Read from each event's own modifier state rather than
	 * tracking keydown/keyup pairs: input methods can swallow a lone Shift release, and the
	 * next mouse move then still reports the truth.
	 */
	let shift = $state(false);
	const trackShift = (event: KeyboardEvent | PointerEvent) => (shift = event.shiftKey);
	/** View props every pane shares: synced zoom/pan, the Shift loupe and one sound state. */
	const view = $derived({
		zoomed: duel.zoomed,
		pan: duel.pan,
		onpan: (pan: { x: number; y: number }) => (duel.pan = pan),
		loupe: shift,
		muted: duel.muted,
		ontogglemute: () => (duel.muted = !duel.muted)
	});

	const legend = $derived.by((): LegendItem[] => {
		const shared: LegendItem[] = [
			{ key: 'A', label: 'album', action: () => duel.setOverlay('album') },
			{ key: 'G', label: 'skip group — stays unreviewed', action: duel.skip },
			{ key: 'U', label: 'undo', action: duel.undo },
			{ key: '↑ ↓', label: 'hold — full screen' },
			{ key: 'Z', label: 'zoom', action: toggleZoom },
			{ key: '?', label: 'shortcuts', action: props.onHelp }
		];
		const mute: LegendItem[] =
			duel.group?.kind === 'video'
				? [{ key: 'M', label: duel.muted ? 'unmute' : 'mute', action: view.ontogglemute }]
				: [];
		if (duel.isSingle) {
			return [
				{ key: 'space', label: 'keep', action: () => duel.decideSingle(true) },
				{ key: 'X', label: 'cull', action: () => duel.decideSingle(false) },
				...mute,
				...shared
			];
		}
		return [
			{ key: '←', label: 'champion stays', action: () => duel.decide('defend') },
			{ key: '→', label: 'challenger wins', action: () => duel.decide('dethrone') },
			{ key: 'B', label: 'keep both — new one to beat', action: () => duel.decide('keepBoth') },
			...(duel.canReel ? [{ key: 'S', label: 'add to reel', action: () => duel.decide('reel') }] : []),
			...mute,
			...shared
		];
	});
</script>

<svelte:window
	onkeydown={trackShift}
	onkeyup={trackShift}
	onpointermove={trackShift}
	onblur={() => {
		shift = false;
		lifted = null;
	}}
/>

<div class="battle">
	<header class="topbar">
		<span class="brand">focull<span class="dot">.</span></span>
		<span class="mono muted">group {session.gi + 1}/{session.groups.length}</span>
		<span class="label">{duel.label}</span>
		<span class="tallies mono">
			<span class="t-keep" title="kept">✓ {tally.kept}</span>
			<span class="t-rej" title="culled">✕ {tally.culled}</span>
			<span class="t-reel" title="reel">◉ {tally.reel}</span>
		</span>
	</header>

	<main class={['stage', duel.isSingle && 'single']}>
		{#if duel.isSingle && duel.champion}
			<Pane
				{...view}
				asset={duel.champion}
				kind="single"
				lifted={lifted === 'champion'}
				stagedCount={session.stagedCount(duel.champion.id)} />
		{:else if duel.champion && duel.challenger && duel.state && duel.group}
			<Pane
				{...view}
				asset={duel.champion}
				kind="champion"
				lifted={lifted === 'champion'}
				stagedCount={session.stagedCount(duel.champion.id)}
				onpick={() => duel.decide('defend')}
				title="champion stays (defend)"
			/>
			<Pane
				{...view}
				asset={duel.challenger}
				kind="challenger"
				lifted={lifted === 'challenger'}
				sub="{duel.group.assets.length - duel.state.queue.length} of {duel.group.assets.length - 1}"
				onpick={() => duel.decide('dethrone')}
				title="challenger wins (dethrone)"
			/>
		{/if}
	</main>

	{#if duel.group && duel.state && !duel.isSingle}
		<Carousel
			group={duel.group}
			state={duel.state}
			onJump={(idx) => props.active && session.jumpTo(idx)}
		/>
	{/if}

	<KeyLegend
		items={legend}
		notes={['esc back to picker', 'nothing is deleted until you commit']}
	/>
</div>

{#if duel.overlay === 'album' && duel.champion}
	<AlbumPalette asset={duel.champion} notify={props.notify} onClose={() => duel.setOverlay(null)} />
{/if}

<style>
	.battle {
		height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto auto;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		font-size: 12px;
	}

	.tallies {
		margin-left: auto;
		display: flex;
		gap: 14px;
		font-size: 12px;
	}

	.t-keep {
		color: var(--keep);
	}

	.t-rej {
		color: var(--rej);
	}

	.t-reel {
		color: var(--reel);
	}

	.stage {
		display: grid;
		grid-template-columns: 58fr 42fr;
		gap: 10px;
		padding: 10px;
		min-height: 0;
	}

	.stage.single {
		grid-template-columns: minmax(0, 900px);
		justify-content: center;
	}
</style>
