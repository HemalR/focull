<script lang="ts">
	import type { CullGroup, GroupState } from '$lib/types';
	import { thumbnailUrl } from '$lib/immich';

	let {
		group,
		state,
		onJump
	}: { group: CullGroup; state: GroupState; onJump: (idx: number) => void } = $props();

	type Status = 'champion' | 'current' | 'undecided' | 'rejected' | 'kept' | 'reel';

	const status = (idx: number): Status => {
		if (idx === state.championIdx) return 'champion';
		const fate = state.fates[idx];
		if (fate) return fate;
		return idx === state.queue[0] ? 'current' : 'undecided';
	};

	const marks: Partial<Record<Status, string>> = {
		champion: '◆',
		rejected: '✕',
		kept: '✓',
		reel: '◉'
	};
</script>

<div class="carousel">
	{#each group.assets as asset, idx (asset.id)}
		{@const st = status(idx)}
		{#if st === 'undecided'}
			<button
				type="button"
				class="thumb undecided"
				title="battle this one next"
				onclick={() => onJump(idx)}
			>
				<img src={thumbnailUrl(asset.id)} alt="" loading="lazy" />
			</button>
		{:else}
			<span class={['thumb', st]}>
				<img src={thumbnailUrl(asset.id)} alt="" loading="lazy" />
				{#if marks[st]}<span class="mark">{marks[st]}</span>{/if}
			</span>
		{/if}
	{/each}
</div>

<style>
	.carousel {
		display: flex;
		gap: 8px;
		padding: 8px 14px;
		overflow-x: auto;
		border-top: 1px solid var(--line);
		background: var(--panel);
	}

	.thumb {
		position: relative;
		flex: 0 0 auto;
		width: 76px;
		height: 56px;
		border: 1px solid var(--line);
		border-radius: 4px;
		overflow: hidden;
		background: #000;
		padding: 0;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.thumb.champion {
		border-color: var(--amber);
	}

	.thumb.current {
		border-color: var(--ink);
	}

	.thumb.rejected {
		opacity: 0.35;
	}

	button.thumb:hover {
		border-color: var(--mut);
	}

	.mark {
		position: absolute;
		right: 3px;
		bottom: 1px;
		font-family: var(--mono);
		font-size: 12px;
		color: var(--ink);
		text-shadow: 0 1px 3px #000;
	}

	.thumb.champion .mark {
		color: var(--amber);
	}

	.thumb.rejected .mark {
		color: var(--rej);
	}

	.thumb.kept .mark {
		color: var(--keep);
	}

	.thumb.reel .mark {
		color: var(--reel);
	}
</style>
