<script lang="ts">
	import type { CullGroup, GroupState } from '$lib/types';
	import { thumbnailUrl } from '$lib/immich';
	import { thumbhashStyle } from '$lib/thumbhash';

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

	let strip: HTMLElement;
	let shownGroup: string | undefined;

	// Keep the current challenger centred: glide there after each decision, jump on a new group.
	$effect(() => {
		const thumb = state.queue[0] === undefined ? undefined : strip.children[state.queue[0]];
		if (!(thumb instanceof HTMLElement)) return;
		const jump = group.id !== shownGroup || matchMedia('(prefers-reduced-motion: reduce)').matches;
		shownGroup = group.id;
		strip.scrollTo({
			left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2,
			behavior: jump ? 'instant' : 'smooth'
		});
	});
</script>

<div class="carousel" bind:this={strip}>
	{#each group.assets as asset, idx (asset.id)}
		{@const st = status(idx)}
		{#if st === 'undecided'}
			<button
				type="button"
				class="thumb undecided"
				title="battle this one next"
				onclick={() => onJump(idx)}
			>
				<img src={thumbnailUrl(asset.id)} alt="" loading="lazy" style={thumbhashStyle(asset)} />
			</button>
		{:else}
			<span class={['thumb', st]}>
				<img src={thumbnailUrl(asset.id)} alt="" loading="lazy" style={thumbhashStyle(asset)} />
				{#if marks[st]}<span class="mark">{marks[st]}</span>{/if}
			</span>
		{/if}
	{/each}
</div>

<style>
	.carousel {
		/* The thumbs' offsetParent, so their offsetLeft is measured within the strip. */
		position: relative;
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
