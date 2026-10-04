<script lang="ts">
	import { Duel, type DuelAction, type DuelProps } from '$lib/duel.svelte';
	import { onKey, type Action } from '$lib/keymap.svelte';
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
	/**
	 * Momentary full screen, "holding a photo up to your face": `held` is the side whose hold
	 * key is down, `lifted` the pane on screen. While held, the pane keys flip between the two
	 * and keep / cull judge the one on screen; after any decision the held side comes back up.
	 */
	let held = $state<Side | null>(null);
	let lifted = $state<Side | null>(null);
	const holdUp = (action: Action, pane: Side) => {
		onKey(
			action,
			() => {
				if (!held) held = lifted = duel.isSingle ? 'champion' : pane;
			},
			() => ({ enabled: duel.keysActive })
		);
		onKey(action, () => (held = lifted = null), { eventType: 'keyup' });
	};
	holdUp('liftChallenger', 'challenger');
	holdUp('liftChampion', 'champion');

	const decide = (action: DuelAction) => {
		duel.decide(action);
		lifted = held;
	};
	/** A pane key: decide — or, while one is lifted, flip to the other. */
	const paneKey = (action: DuelAction) => () =>
		lifted ? (lifted = lifted === 'champion' ? 'challenger' : 'champion') : decide(action);
	const dueling = () => ({ enabled: duel.dueling });
	onKey('defend', paneKey('defend'), dueling);
	onKey('dethrone', paneKey('dethrone'), dueling);
	onKey('keepBoth', () => decide('keepBoth'), dueling);
	onKey('reel', () => decide('reel'), () => ({ enabled: duel.dueling && duel.canReel }));

	/** Keep or cull the photo on screen: a single, or the side held up full screen. */
	const judgeShown = (keep: boolean) => () => {
		if (duel.isSingle) duel.decideSingle(keep);
		else decide((lifted === 'champion') === keep ? 'defend' : 'dethrone');
	};
	const shownJudgeable = () => ({
		enabled: duel.keysActive && (duel.isSingle || (duel.dueling && lifted !== null))
	});
	onKey('keep', judgeShown(true), shownJudgeable);
	onKey('cull', judgeShown(false), shownJudgeable);

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
		ontogglemute: duel.toggleMute
	});

	const legend = $derived.by((): LegendItem[] => {
		const shared: LegendItem[] = [
			{ action: 'album', label: 'album', run: () => duel.setOverlay('album') },
			{ action: 'skip', label: 'skip group — stays unreviewed', run: duel.skip },
			{ action: 'undo', label: 'undo', run: duel.undo },
			{ action: ['liftChallenger', 'liftChampion'], label: 'hold — full screen' },
			{ action: 'zoom', label: 'zoom', run: duel.toggleZoom },
			{ keys: '?', label: 'shortcuts', run: props.onHelp }
		];
		const mute: LegendItem[] =
			duel.group?.kind === 'video'
				? [{ action: 'mute', label: duel.muted ? 'unmute' : 'mute', run: duel.toggleMute }]
				: [];
		if (duel.isSingle) {
			return [
				{ action: 'keep', label: 'keep', run: () => duel.decideSingle(true) },
				{ action: 'cull', label: 'cull', run: () => duel.decideSingle(false) },
				...mute,
				...shared
			];
		}
		return [
			{ action: 'defend', label: 'champion stays', run: () => duel.decide('defend') },
			{ action: 'dethrone', label: 'challenger wins', run: () => duel.decide('dethrone') },
			{ action: 'keepBoth', label: 'keep both — new one to beat', run: () => duel.decide('keepBoth') },
			...(duel.canReel ? [{ action: 'reel', label: 'add to reel', run: () => duel.decide('reel') } as const] : []),
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
		held = lifted = null;
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
