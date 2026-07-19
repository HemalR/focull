<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { thumbnailUrl } from '$lib/immich';
	import { thumbhashStyle } from '$lib/thumbhash';
	import { durationMs, fmtDuration, plural } from '$lib/format';
	import { session } from '$lib/session.svelte';

	let { last, onNext }: { last: boolean; onNext: () => void } = $props();

	const group = $derived(session.group);
	const gstate = $derived(session.current);
	const winner = $derived(group && gstate ? group.assets[gstate.championIdx] : undefined);

	const fates = $derived(gstate ? Object.values(gstate.fates) : []);
	const culled = $derived(fates.filter((f) => f === 'rejected').length);
	const kept = $derived(fates.filter((f) => f === 'kept').length);

	const reelAssets = $derived(
		group?.kind === 'video' && gstate
			? group.assets.filter((_, i) => gstate.fates[i] === 'reel' || i === gstate.championIdx)
			: []
	);
	const reelTotal = $derived(reelAssets.reduce((sum, a) => sum + durationMs(a.duration), 0));

	const culledLine = $derived.by(() => {
		const { rejectAction, tagName } = session.settings;
		if (rejectAction === 'tag') return `will be tagged #${tagName} and stacked behind the winner`;
		if (rejectAction === 'archive') return 'will be archived';
		return 'will be moved to Immich trash';
	});

	createHotkey('Enter', () => onNext(), { conflictBehavior: 'allow' });
</script>

<div class="overlay">
	<div class="card done">
		<span class="label">last one standing</span>
		{#if winner}
			<span class="stack-thumb">
				<img src={thumbnailUrl(winner.id)} alt={winner.originalFileName} style={thumbhashStyle(winner)} />
			</span>
			<span class="mono name">{winner.originalFileName}</span>
		{/if}
		<ul class="mono">
			{#if culled > 0}
				<li class="rej">✕ {plural(culled, 'culled asset')} → {culledLine}</li>
			{/if}
			{#if kept > 0}
				<li class="keep">✓ {kept} also kept</li>
			{/if}
			{#if reelAssets.length >= 2}
				<li class="reel">◉ reel: {plural(reelAssets.length, 'clip')} · {fmtDuration(reelTotal)} → stitched on commit</li>
			{/if}
			{#if culled === 0 && kept === 0 && reelAssets.length < 2}
				<li class="muted">everything survived</li>
			{/if}
		</ul>
		<button type="button" class="btn" onclick={onNext}>
			{last ? 'review' : 'next group'} ↵
		</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: grid;
		place-items: center;
		background: rgb(15 18 16 / 0.75);
	}

	.done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 28px 36px;
		animation: rise 160ms ease-out;
	}

	.stack-thumb {
		position: relative;
		display: block;
		width: 180px;
		height: 130px;
	}

	.stack-thumb::before,
	.stack-thumb::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--panel2);
	}

	.stack-thumb::before {
		transform: translate(8px, -8px) rotate(2deg);
	}

	.stack-thumb::after {
		transform: translate(4px, -4px) rotate(1deg);
	}

	.stack-thumb img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border: 1px solid var(--amber);
		border-radius: 5px;
		z-index: 1;
	}

	.name {
		color: var(--ink);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		text-align: center;
	}

	.rej {
		color: var(--rej);
	}

	.keep {
		color: var(--keep);
	}

	.reel {
		color: var(--reel);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
</style>
