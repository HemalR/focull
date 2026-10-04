<script lang="ts">
	import { thumbnailUrl } from '$lib/immich';
	import { thumbhashStyle } from '$lib/thumbhash';
	import { durationMs, fmtDuration, plural } from '$lib/format';
	import { onKey, rebindable } from '$lib/keymap.svelte';
	import { session } from '$lib/session.svelte';
	import Key from './Key.svelte';

	interface Props {
		last: boolean;
		notify: (msg: string) => void;
		onNext: () => void;
		/** Undo re-opened the duel (queue no longer empty) — back to battle. */
		onReopen: () => void;
	}

	let { last, notify, onNext, onReopen }: Props = $props();

	const group = $derived(session.group);
	const gstate = $derived(session.current);
	const winner = $derived(group && gstate ? group.assets[gstate.championIdx] : undefined);
	const winnerCulled = $derived(gstate ? gstate.fates[gstate.championIdx] === 'rejected' : false);

	const fates = $derived(gstate ? Object.values(gstate.fates) : []);
	const culled = $derived(fates.filter((f) => f === 'rejected').length);
	const kept = $derived(fates.filter((f) => f === 'kept').length);

	const reelAssets = $derived(
		group?.kind === 'video' && gstate
			? group.assets.filter(
					(_, i) =>
						gstate.fates[i] === 'reel' ||
						(i === gstate.championIdx && gstate.fates[i] === undefined)
				)
			: []
	);
	const reelTotal = $derived(reelAssets.reduce((sum, a) => sum + durationMs(a.duration), 0));

	const culledLine = $derived.by(() => {
		const { rejectAction, tagName } = session.settings;
		if (rejectAction === 'archive') return 'will be archived';
		if (rejectAction === 'trash') return 'will be moved to Immich trash';
		return winnerCulled
			? `will be tagged #${tagName}` // nothing survived — nothing to stack behind
			: `will be tagged #${tagName} and stacked behind their keepers`;
	});

	function cullWinner() {
		if (!winner || winnerCulled) return;
		session.cullChampion();
		notify(`${winner.originalFileName} → cull pile`);
	}

	function undo() {
		if (!session.undo()) {
			notify('nothing to undo');
			return;
		}
		notify('undone');
		if ((session.current?.queue.length ?? 0) > 0) onReopen();
	}

	onKey('confirm', () => onNext());
	onKey('cull', cullWinner, () => ({ enabled: !winnerCulled }));
	onKey('undo', undo);
</script>

<div class="overlay">
	<div class="card done">
		<span class={['label', winnerCulled && 'gone']}>
			{winnerCulled ? 'no survivors' : 'last one standing'}
		</span>
		{#if winner}
			<span class={['stack-thumb', winnerCulled && 'culled']}>
				<img src={thumbnailUrl(winner.id)} alt={winner.originalFileName} style={thumbhashStyle(winner)} />
				{#if winnerCulled}<span class="strike mono">✕</span>{/if}
			</span>
			<span class={['mono', 'name', winnerCulled && 'struck']}>{winner.originalFileName}</span>
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
		<button type="button" class="btn" onclick={onNext} {@attach rebindable('confirm')}>
			{last ? 'review' : 'next group'} <Key action="confirm" />
		</button>
		<span class="chips mono">
			{#if !winnerCulled}
				<button type="button" class="chip" onclick={cullWinner} {@attach rebindable('cull')}>
					<Key action="cull" /> cull this one too
				</button>
			{/if}
			<button type="button" class="chip" onclick={undo} {@attach rebindable('undo')}><Key action="undo" /> undo</button>
		</span>
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

	.gone {
		color: var(--rej);
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

	.stack-thumb.culled img {
		border-color: var(--rej);
		opacity: 0.35;
	}

	.strike {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-items: center;
		font-size: 40px;
		color: var(--rej);
	}

	.name {
		color: var(--ink);
	}

	.name.struck {
		text-decoration: line-through;
		color: var(--mut);
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

	.chips {
		display: flex;
		gap: 16px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--mut);
		padding: 2px 4px;
		border-radius: 4px;
	}

	.chip:hover {
		color: var(--ink);
	}

	@media (pointer: coarse) {
		.done {
			width: min(360px, 92vw);
			padding: 24px 20px;
		}

		.done .btn {
			width: 100%;
			padding: 14px;
		}

		.chip {
			font-size: 13px;
			padding: 10px 8px;
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
</style>
