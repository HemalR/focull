<script lang="ts">
	import type { AssetResponseDto } from '@immich/sdk';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { CommitPlan } from '$lib/commit';
	import { thumbnailUrl } from '$lib/immich';
	import { durationMs, fmtDuration, plural } from '$lib/format';
	import { session } from '$lib/session.svelte';
	import KeyLegend from './KeyLegend.svelte';

	let { plan, onCommit }: { plan: CommitPlan; onCommit: () => void } = $props();

	const byId = $derived(
		new Map(session.groups.flatMap((g) => g.assets).map((a) => [a.id, a]))
	);
	const assets = (ids: string[]): AssetResponseDto[] =>
		ids.map((id) => byId.get(id)).filter((a) => a !== undefined);

	/** Winners of finished multi-asset groups + everything explicitly kept, chronological. */
	const keepers = $derived.by(() => {
		const out: AssetResponseDto[] = [];
		session.groups.forEach((g, i) => {
			const s = session.states[i];
			if (s.queue.length > 0) return;
			g.assets.forEach((a, ai) => {
				const fate = s.fates[ai];
				if (fate === 'kept' || (ai === s.championIdx && fate === undefined)) out.push(a);
			});
		});
		return out;
	});

	const culled = $derived(assets(plan.rejectIds));
	const reelClips = $derived(plan.reels.reduce((sum, r) => sum + r.assetIds.length, 0));
	const stacks = $derived(plan.stacks.length + plan.reels.length);

	const sentence = $derived.by(() => {
		const { rejectAction, tagName } = session.settings;
		const parts: string[] = [];
		if (culled.length > 0) {
			if (rejectAction === 'tag') parts.push(`tag ${plural(culled.length, 'culled asset')} #${tagName}`);
			else if (rejectAction === 'archive') parts.push(`archive ${plural(culled.length, 'culled asset')}`);
			else parts.push(`move ${plural(culled.length, 'culled asset')} to the Immich trash`);
		}
		if (stacks > 0) parts.push(`stack culled shots behind their winners (${plural(stacks, 'stack')})`);
		if (plan.reels.length > 0) parts.push(`stitch ${plural(plan.reels.length, 'reel')} (${plural(reelClips, 'clip')})`);
		if (parts.length === 0) return 'Nothing to change in Immich — every asset survived.';
		const tail = rejectAction === 'trash' ? '' : ' Nothing is deleted.';
		return `Commit will ${parts.join(', ')}.${tail}`;
	});

	createHotkey('Enter', () => onCommit(), { conflictBehavior: 'allow' });
</script>

{#snippet thumbRow(list: AssetResponseDto[], cls: string)}
	<div class={['thumbs', cls]}>
		{#each list as asset (asset.id)}
			<span class="thumb" title={asset.originalFileName}>
				<img src={thumbnailUrl(asset.id)} alt={asset.originalFileName} loading="lazy" />
			</span>
		{/each}
	</div>
{/snippet}

<div class="review">
	<header>
		<span class="brand">focull<span class="dot">.</span></span>
		<span class="label">review</span>
	</header>

	<main>
		<div class="tiles">
			<div class="card tile"><strong class="keep">{keepers.length}</strong><span class="label">kept</span></div>
			<div class="card tile"><strong class="rej">{culled.length}</strong><span class="label">culled</span></div>
			<div class="card tile"><strong class="reel">{reelClips}</strong><span class="label">reel clips</span></div>
			<div class="card tile"><strong>{stacks}</strong><span class="label">stacks</span></div>
		</div>

		{#if keepers.length > 0}
			<section>
				<h2 class="label">keepers</h2>
				{@render thumbRow(keepers, 'keepers')}
			</section>
		{/if}

		{#each plan.reels as reel, ri (reel.filename)}
			{@const clips = assets(reel.assetIds)}
			<section>
				<h2 class="label">
					reel{plan.reels.length > 1 ? ` ${ri + 1}` : ''} ·
					{fmtDuration(clips.reduce((sum, a) => sum + durationMs(a.duration), 0))} total
				</h2>
				<div class="thumbs">
					{#each clips as asset, i (asset.id)}
						<span class="thumb reel-clip" title={asset.originalFileName}>
							<img src={thumbnailUrl(asset.id)} alt={asset.originalFileName} loading="lazy" />
							<span class="order mono">{i + 1}</span>
							<span class="dur mono">{fmtDuration(asset.duration)}</span>
						</span>
					{/each}
				</div>
			</section>
		{/each}

		{#if culled.length > 0}
			<section>
				<h2 class="label">culled</h2>
				{@render thumbRow(culled, 'dimmed')}
			</section>
		{/if}

		<p class="sentence mono">{sentence}</p>

		<button type="button" class="btn commit" onclick={onCommit}>commit ↵</button>
	</main>

	<KeyLegend
		items={[{ key: '↵', label: 'commit', action: onCommit }]}
		notes={['esc back to picker']}
	/>
</div>

<style>
	.review {
		height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto;
	}

	header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		background: var(--panel);
	}

	main {
		overflow-y: auto;
		padding: 20px 24px 40px;
		width: min(1000px, 100%);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}

	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 14px;
	}

	.tile strong {
		font-family: var(--mono);
		font-size: 22px;
	}

	.keep {
		color: var(--keep);
	}

	.rej {
		color: var(--rej);
	}

	.reel {
		color: var(--reel);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	h2 {
		margin: 0;
	}

	.thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.thumb {
		position: relative;
		width: 84px;
		height: 62px;
		border: 1px solid var(--line);
		border-radius: 4px;
		overflow: hidden;
		background: #000;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.keepers .thumb {
		border-color: var(--amber-dim);
	}

	.dimmed .thumb {
		opacity: 0.4;
	}

	.reel-clip {
		border-color: var(--reel);
	}

	.order {
		position: absolute;
		top: 2px;
		left: 4px;
		font-size: 11px;
		color: var(--reel);
		text-shadow: 0 1px 3px #000;
	}

	.dur {
		position: absolute;
		right: 4px;
		bottom: 2px;
		font-size: 10px;
		color: var(--ink);
		text-shadow: 0 1px 3px #000;
	}

	.sentence {
		margin: 0;
		color: var(--ink);
		border-left: 2px solid var(--amber-dim);
		padding-left: 12px;
	}

	.commit {
		align-self: flex-start;
	}
</style>
