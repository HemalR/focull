<script lang="ts">
	import type { AssetResponseDto } from '@immich/sdk';
	import type { CommitPlan } from '$lib/commit';
	import { thumbnailUrl } from '$lib/immich';
	import { thumbhashStyle } from '$lib/thumbhash';
	import { durationMs, fmtDuration, plural } from '$lib/format';
	import { session } from '$lib/session.svelte';
	import type { Fate } from '$lib/types';
	import { onKey, rebindable } from '$lib/keymap.svelte';
	import Key from './Key.svelte';
	import KeyLegend from './KeyLegend.svelte';

	interface Props {
		plan: CommitPlan;
		stitchAvailable: boolean;
		notify: (msg: string) => void;
		/** A fate was edited — recompute the plan. */
		onChanged: () => void;
		onCommit: () => void;
		/** Abandon the session, back to the picker (Esc). */
		onExit: () => void;
	}

	let { plan, stitchAvailable, notify, onChanged, onCommit, onExit }: Props = $props();

	interface Thumb {
		asset: AssetResponseDto;
		gi: number;
		ai: number;
		/** Carries a fate, so clicking cycles it. The champion has none. */
		editable: boolean;
	}

	const locate = $derived(
		new Map(
			session.groups.flatMap((g, gi) => g.assets.map((a, ai) => [a.id, { gi, ai, asset: a }]))
		)
	);

	const toThumb = (id: string): Thumb | null => {
		const loc = locate.get(id);
		return loc
			? {
					asset: loc.asset,
					gi: loc.gi,
					ai: loc.ai,
					editable: session.states[loc.gi]?.fates[loc.ai] !== undefined
				}
			: null;
	};

	/** Winners of judged groups + everything explicitly kept, chronological. */
	const keepers = $derived.by(() => {
		const out: Thumb[] = [];
		session.groups.forEach((g, gi) => {
			if (!session.isJudged(gi)) return;
			const s = session.states[gi];
			g.assets.forEach((asset, ai) => {
				const fate = s.fates[ai];
				if (fate === 'kept' || (ai === s.championIdx && fate === undefined)) {
					out.push({ asset, gi, ai, editable: fate !== undefined });
				}
			});
		});
		return out;
	});

	const culled = $derived(plan.rejectIds.map(toThumb).filter((t) => t !== null));
	const reelClips = $derived(plan.reels.reduce((sum, r) => sum + r.assetIds.length, 0));
	const stacks = $derived(plan.stacks.length + plan.reels.length);

	const FATE_LABEL: Record<Fate, string> = {
		rejected: 'cull pile',
		kept: 'kept',
		reel: 'reel'
	};

	/** Multi-group champions toggle alive ↔ culled; everything else runs the fate cycle. */
	const isMultiChampion = (thumb: Thumb): boolean =>
		(session.groups[thumb.gi]?.assets.length ?? 0) > 1 &&
		thumb.ai === session.states[thumb.gi]?.championIdx;

	function cycle(thumb: Thumb) {
		const group = session.groups[thumb.gi];
		if (!group) return;
		const name = thumb.asset.originalFileName;
		if (isMultiChampion(thumb)) {
			const culled = session.toggleChampionCull(thumb.gi);
			notify(culled ? `${name} → cull pile` : `${name} restored as winner`);
		} else {
			const next = session.cycleFate(thumb.gi, thumb.ai, group.kind === 'video' && stitchAvailable);
			if (next === null) return;
			notify(`${name} → ${FATE_LABEL[next]}`);
		}
		onChanged();
	}

	const sentence = $derived.by(() => {
		const { rejectAction, tagName, reviewedTagName } = session.settings;
		const parts: string[] = [];
		if (culled.length > 0) {
			if (rejectAction === 'tag') parts.push(`tag ${plural(culled.length, 'culled asset')} #${tagName}`);
			else if (rejectAction === 'archive') parts.push(`archive ${plural(culled.length, 'culled asset')}`);
			else parts.push(`move ${plural(culled.length, 'culled asset')} to the Immich trash`);
		}
		if (stacks > 0) parts.push(`stack culled shots behind their winners (${plural(stacks, 'stack')})`);
		if (plan.reels.length > 0) parts.push(`stitch ${plural(plan.reels.length, 'reel')} (${plural(reelClips, 'clip')})`);
		if (plan.albums.length > 0) parts.push(`update ${plural(plan.albums.length, 'album')}`);
		if (plan.reviewedIds.length > 0) {
			parts.push(`mark all ${plural(plan.reviewedIds.length, 'processed asset')} #${reviewedTagName} so future sessions skip them`);
		}
		if (parts.length === 0) return 'Nothing to change in Immich — every asset survived.';
		const tail = rejectAction === 'trash' ? '' : ' Nothing is deleted.';
		return `Commit will ${parts.join(', ')}.${tail}`;
	});

	onKey('confirm', () => onCommit());
</script>

{#snippet mini(thumb: Thumb, extra?: string)}
	<button
		type="button"
		class="thumb editable"
		title="{thumb.asset.originalFileName} — {thumb.editable
			? 'click to change its fate'
			: 'the winner · click to cull it too'}"
		onclick={() => cycle(thumb)}
	>
		<img
			src={thumbnailUrl(thumb.asset.id)}
			alt={thumb.asset.originalFileName}
			loading="lazy"
			style={thumbhashStyle(thumb.asset)}
		/>
		{#if extra}<span class="dur mono">{extra}</span>{/if}
	</button>
{/snippet}

<div class="review">
	<header>
		<span class="brand">focull<span class="dot">.</span></span>
		<span class="label">review</span>
		<span class="muted mono hint">tap a thumb to change its fate</span>
	</header>

	<main>
		<div class="tiles">
			<div class="card tile"><strong class="keep">{keepers.length}</strong><span class="label">kept</span></div>
			<div class="card tile"><strong class="rej">{culled.length}</strong><span class="label">culled</span></div>
			<div class="card tile"><strong class="reel">{reelClips}</strong><span class="label">reel clips</span></div>
			<div class="card tile"><strong>{stacks}</strong><span class="label">stacks</span></div>
		</div>

		{#if session.skipped.length > 0}
			<p class="muted mono skipped">
				{plural(session.skipped.length, 'group')} skipped — they stay unreviewed
			</p>
		{/if}

		{#if keepers.length > 0}
			<section>
				<h2 class="label">keepers</h2>
				<div class="thumbs keepers">
					{#each keepers as thumb (thumb.asset.id)}{@render mini(thumb)}{/each}
				</div>
			</section>
		{/if}

		{#each plan.reels as reel, ri (reel.filename)}
			{@const clips = reel.assetIds.map(toThumb).filter((t) => t !== null)}
			<section>
				<h2 class="label">
					reel{plan.reels.length > 1 ? ` ${ri + 1}` : ''} ·
					{fmtDuration(clips.reduce((sum, t) => sum + durationMs(t.asset.duration), 0))} total
				</h2>
				<div class="thumbs reel-row">
					{#each clips as thumb, i (thumb.asset.id)}
						<span class="clip">
							<span class="order mono">{i + 1}</span>
							{@render mini(thumb, fmtDuration(thumb.asset.duration))}
						</span>
					{/each}
				</div>
			</section>
		{/each}

		{#if culled.length > 0}
			<section>
				<h2 class="label">culled</h2>
				<div class="thumbs dimmed">
					{#each culled as thumb (thumb.asset.id)}{@render mini(thumb)}{/each}
				</div>
			</section>
		{/if}

		{#if plan.albums.length > 0}
			<section>
				<h2 class="label">albums</h2>
				<ul class="albums mono">
					{#each plan.albums as album (album.albumId ?? album.name)}
						<li>
							◇ {album.name} — {plural(album.assetIds.length, 'asset')}
							{#if !album.albumId}<span class="muted">(created on commit)</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<p class="sentence mono">{sentence}</p>

		<button type="button" class="btn commit" onclick={onCommit} {@attach rebindable('confirm')}>
			commit <Key action="confirm" />
		</button>
	</main>

	<KeyLegend
		items={[
			{ action: 'confirm', label: 'commit', run: onCommit },
			{ keys: 'esc', label: 'back to picker', run: onExit }
		]}
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

	.hint {
		margin-left: auto;
		font-size: 11px;
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

	.skipped {
		margin: -8px 0 0;
		font-size: 12px;
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
		padding: 0;
		display: block;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	button.thumb.editable:hover {
		border-color: var(--amber);
		box-shadow: 0 0 0 1px var(--amber-dim);
	}

	.keepers .thumb {
		border-color: var(--amber-dim);
	}

	.dimmed .thumb {
		opacity: 0.4;
	}

	.dimmed button.thumb:hover {
		opacity: 1;
	}

	.reel-row .thumb {
		border-color: var(--reel);
	}

	.clip {
		position: relative;
	}

	.order {
		position: absolute;
		top: 2px;
		left: 4px;
		z-index: 2;
		font-size: 11px;
		color: var(--reel);
		text-shadow: 0 1px 3px #000;
		pointer-events: none;
	}

	.dur {
		position: absolute;
		right: 4px;
		bottom: 2px;
		font-size: 10px;
		color: var(--ink);
		text-shadow: 0 1px 3px #000;
	}

	.albums {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
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

	@media (max-width: 760px) {
		main {
			padding: 14px 12px 28px;
		}

		.tiles {
			grid-template-columns: repeat(2, 1fr);
		}

		.commit {
			align-self: stretch;
			padding: 14px;
		}
	}
</style>
