<script lang="ts">
	import { AssetTypeEnum } from '@immich/sdk';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { previewUrl } from '$lib/immich';
	import { prefetchImage } from '$lib/prefetch';
	import { localDate, plural } from '$lib/format';
	import { session } from '$lib/session.svelte';
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
	}

	let { active, stitchAvailable, notify, onGroupDone, onSingleDone }: Props = $props();

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
	let recent: number[] = [];

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

	function decide(action: 'defend' | 'dethrone' | 'both' | 'reel') {
		if (!challenger || challengerIdx === undefined) return;
		const name = challenger.originalFileName;
		recent.push(action === 'dethrone' && gstate ? gstate.championIdx : challengerIdx);
		session[action]();
		notify(
			{
				defend: `${name} → cull pile`,
				dethrone: `${name} takes the crown`,
				both: `${name} survives`,
				reel: `${name} → reel`
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

	const duel = $derived(active && !isSingle && !!challenger);
	createHotkey('ArrowLeft', () => decide('defend'), () => ({ enabled: duel }));
	createHotkey('ArrowRight', () => decide('dethrone'), () => ({ enabled: duel }));
	createHotkey('B', () => decide('both'), () => ({ enabled: duel }));
	createHotkey('S', () => decide('reel'), () => ({ enabled: duel && canReel }));
	createHotkey('Space', () => decideSingle(true), () => ({ enabled: active && isSingle }));
	createHotkey('X', () => decideSingle(false), () => ({ enabled: active && isSingle }));
	createHotkey('U', undo, () => ({ enabled: active }));
	createHotkey('Z', () => (zoomed = !zoomed), () => ({ enabled: active }));

	const legend = $derived.by((): LegendItem[] => {
		if (isSingle) {
			return [
				{ key: 'space', label: 'keep', action: () => decideSingle(true) },
				{ key: 'X', label: 'cull', action: () => decideSingle(false) },
				{ key: 'U', label: 'undo', action: undo },
				{ key: 'Z', label: 'zoom', action: () => (zoomed = !zoomed) }
			];
		}
		return [
			{ key: '←', label: 'champion stays', action: () => decide('defend') },
			{ key: '→', label: 'challenger wins', action: () => decide('dethrone') },
			{ key: 'B', label: 'both survive', action: () => decide('both') },
			...(canReel ? [{ key: 'S', label: 'add to reel', action: () => decide('reel') }] : []),
			{ key: 'U', label: 'undo', action: undo },
			{ key: 'Z', label: 'zoom', action: () => (zoomed = !zoomed) }
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
			<Pane asset={champion} kind="single" {zoomed} />
		{:else if champion && challenger && gstate && group}
			<Pane
				asset={champion}
				kind="champion"
				{zoomed}
				onpick={() => decide('defend')}
				title="champion stays (defend)"
			/>
			<Pane
				asset={challenger}
				kind="challenger"
				sub="{group.assets.length - gstate.queue.length} of {group.assets.length - 1}"
				{zoomed}
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
