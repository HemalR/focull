<script lang="ts">
	import { AssetTypeEnum } from '@immich/sdk';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { previewUrl } from '$lib/immich';
	import { prefetchImage } from '$lib/prefetch';
	import { localDate, plural } from '$lib/format';
	import { session } from '$lib/session.svelte';
	import AlbumPalette from './AlbumPalette.svelte';
	import Pane from './Pane.svelte';
	import Carousel from './Carousel.svelte';
	import KeyLegend, { type LegendItem } from './KeyLegend.svelte';

	interface Props {
		/** false while the group-done overlay is up, so battle keys go quiet. */
		active: boolean;
		stitchAvailable: boolean;
		notify: (msg: string, err?: boolean) => void;
		onGroupDone: () => void;
		onSingleDone: () => void;
		/** Group skipped — advance past it. */
		onSkipped: () => void;
		onHelp: () => void;
		/** The album palette opened/closed — the page gates its Escape handler on this. */
		onOverlay: (open: boolean) => void;
	}

	let {
		active,
		stitchAvailable,
		notify,
		onGroupDone,
		onSingleDone,
		onSkipped,
		onHelp,
		onOverlay
	}: Props = $props();

	const group = $derived(session.group);
	const gstate = $derived(session.current);
	const isSingle = $derived((group?.assets.length ?? 0) === 1);
	const champion = $derived(group && gstate ? group.assets[gstate.championIdx] : undefined);
	const challengerIdx = $derived(gstate?.queue[0]);
	const challenger = $derived(
		group && challengerIdx !== undefined ? group.assets[challengerIdx] : undefined
	);
	const canReel = $derived(group?.kind === 'video' && stitchAvailable);
	const tally = $derived(session.tally);

	const groupLabel = $derived.by(() => {
		if (!group) return '';
		const n = group.assets.length;
		return `${localDate(group.assets[0].localDateTime)} · ${plural(n, group.kind)}`;
	});

	let zoomed = $state(false);
	let pan = $state({ x: 0.5, y: 0.5 });
	/** One shared sound state for both panes; default muted, sticky for the session. */
	let muted = $state(true);
	let paletteOpen = $state(false);
	let recent: number[] = [];

	function setPalette(open: boolean) {
		paletteOpen = open;
		onOverlay(open);
	}

	// New group: reset zoom and the recently-decided prefetch list.
	$effect(() => {
		void session.gi;
		zoomed = false;
		recent = [];
	});

	// Keep the next 6 queued previews + the last 2 decided (undo fodder) warm.
	$effect(() => {
		const g = session.group;
		const s = session.current;
		if (!g || !s) return;
		for (const idx of [...s.queue.slice(1, 7), ...recent.slice(-2)]) {
			const a = g.assets[idx];
			if (a && a.type !== AssetTypeEnum.Video) prefetchImage(previewUrl(a.id));
		}
	});

	function decide(action: 'defend' | 'dethrone' | 'both' | 'reel' | 'promoteKeep') {
		if (!challenger || challengerIdx === undefined) return;
		const name = challenger.originalFileName;
		const crowning = action === 'dethrone' || action === 'promoteKeep';
		recent.push(crowning && gstate ? gstate.championIdx : challengerIdx);
		session[action]();
		notify(
			{
				defend: `${name} → cull pile`,
				dethrone: `${name} takes the crown`,
				both: `${name} survives`,
				reel: `${name} → reel`,
				promoteKeep: `${name} takes the crown — old champion kept`
			}[action]
		);
		if (session.current?.queue.length === 0) onGroupDone();
	}

	function decideSingle(keep: boolean) {
		if (!champion) return;
		notify(keep ? `${champion.originalFileName} kept` : `${champion.originalFileName} → cull pile`);
		session.decideSingle(keep);
		onSingleDone();
	}

	function undo() {
		notify(session.undo() ? 'undone' : 'nothing to undo');
	}

	function skip() {
		session.skipCurrent();
		notify('group skipped — stays unreviewed');
		onSkipped();
	}

	const keysActive = $derived(active && !paletteOpen);
	const duel = $derived(keysActive && !isSingle && !!challenger);
	createHotkey('ArrowLeft', () => decide('defend'), () => ({ enabled: duel }));
	createHotkey('ArrowRight', () => decide('dethrone'), () => ({ enabled: duel }));
	createHotkey('Shift+ArrowRight', () => decide('promoteKeep'), () => ({ enabled: duel }));
	createHotkey('B', () => decide('both'), () => ({ enabled: duel }));
	createHotkey('S', () => decide('reel'), () => ({ enabled: duel && canReel }));
	createHotkey('Space', () => decideSingle(true), () => ({ enabled: keysActive && isSingle }));
	createHotkey('X', () => decideSingle(false), () => ({ enabled: keysActive && isSingle }));
	createHotkey('U', undo, () => ({ enabled: keysActive }));
	createHotkey('Z', () => (zoomed = !zoomed), () => ({ enabled: keysActive }));
	createHotkey('G', skip, () => ({ enabled: keysActive }));
	createHotkey('A', () => setPalette(true), () => ({ enabled: keysActive && !!champion }));
	createHotkey('M', () => (muted = !muted), () => ({
		enabled: keysActive && group?.kind === 'video'
	}));

	const legend = $derived.by((): LegendItem[] => {
		const shared: LegendItem[] = [
			{ key: 'A', label: 'album', action: () => setPalette(true) },
			{ key: 'G', label: 'skip group — stays unreviewed', action: skip },
			{ key: 'U', label: 'undo', action: undo },
			{ key: 'Z', label: 'zoom', action: () => (zoomed = !zoomed) },
			{ key: '?', label: 'shortcuts', action: onHelp }
		];
		const mute: LegendItem[] =
			group?.kind === 'video'
				? [{ key: 'M', label: muted ? 'unmute' : 'mute', action: () => (muted = !muted) }]
				: [];
		if (isSingle) {
			return [
				{ key: 'space', label: 'keep', action: () => decideSingle(true) },
				{ key: 'X', label: 'cull', action: () => decideSingle(false) },
				...mute,
				...shared
			];
		}
		return [
			{ key: '←', label: 'champion stays', action: () => decide('defend') },
			{ key: '→', label: 'challenger wins', action: () => decide('dethrone') },
			{ key: '⇧→', label: 'crown, keep old champ', action: () => decide('promoteKeep') },
			{ key: 'B', label: 'both survive', action: () => decide('both') },
			...(canReel ? [{ key: 'S', label: 'add to reel', action: () => decide('reel') }] : []),
			...mute,
			...shared
		];
	});
</script>

<div class="battle">
	<header class="topbar">
		<span class="brand">focull<span class="dot">.</span></span>
		<span class="mono muted">group {session.gi + 1}/{session.groups.length}</span>
		<span class="label">{groupLabel}</span>
		<span class="tallies mono">
			<span class="t-keep" title="kept">✓ {tally.kept}</span>
			<span class="t-rej" title="culled">✕ {tally.culled}</span>
			<span class="t-reel" title="reel">◉ {tally.reel}</span>
		</span>
	</header>

	<main class={['stage', isSingle && 'single']}>
		{#if isSingle && champion}
			<Pane
				asset={champion}
				kind="single"
				stagedCount={session.stagedCount(champion.id)}
				{zoomed}
				{pan}
				onpan={(p) => (pan = p)}
				loupe={session.settings.hoverLoupe}
				{muted}
				ontogglemute={() => (muted = !muted)}
			/>
		{:else if champion && challenger && gstate && group}
			<Pane
				asset={champion}
				kind="champion"
				stagedCount={session.stagedCount(champion.id)}
				{zoomed}
				{pan}
				onpan={(p) => (pan = p)}
				loupe={session.settings.hoverLoupe}
				{muted}
				ontogglemute={() => (muted = !muted)}
				onpick={() => decide('defend')}
				title="champion stays (defend)"
			/>
			<Pane
				asset={challenger}
				kind="challenger"
				sub="{group.assets.length - gstate.queue.length} of {group.assets.length - 1}"
				{zoomed}
				{pan}
				onpan={(p) => (pan = p)}
				loupe={session.settings.hoverLoupe}
				{muted}
				ontogglemute={() => (muted = !muted)}
				onpick={() => decide('dethrone')}
				title="challenger wins (dethrone)"
			/>
		{/if}
	</main>

	{#if group && gstate && !isSingle}
		<Carousel {group} state={gstate} onJump={(idx) => active && session.jumpTo(idx)} />
	{/if}

	<KeyLegend
		items={legend}
		notes={['esc back to picker', 'nothing is deleted until you commit']}
	/>
</div>

{#if paletteOpen && champion}
	<AlbumPalette asset={champion} {notify} onClose={() => setPalette(false)} />
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
