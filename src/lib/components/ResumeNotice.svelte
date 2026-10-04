<script lang="ts">
	import { calendarDate, localDate, plural, timeAgo } from '$lib/format';
	import { session } from '$lib/session.svelte';
	import { MEDIA_LABELS } from '$lib/types';

	/**
	 * Says which saved session the app reopened, until the user does anything at all: any key,
	 * or a press anywhere outside the notice. Its own button starts a fresh trip instead.
	 */
	let { onNew, onDismiss }: { onNew: () => void; onDismiss: () => void } = $props();

	let box: HTMLElement;

	const what = $derived.by((): string => {
		const { source, groups } = session;
		switch (source?.kind) {
			case 'trip':
				return `a trip back to ${localDate(groups[0].assets[0].localDateTime)}`;
			case 'album':
				return `album “${source.albumName}”`;
			case 'range':
				return `${calendarDate(source.takenAfter)} – ${calendarDate(source.takenBefore)}`;
			case 'new':
				return `new since ${calendarDate(source.takenAfter)}`;
			case 'unreviewed':
				return 'unreviewed photos';
			case 'duplicates':
				return 'duplicates';
			case undefined:
				return 'your last session';
		}
	});
</script>

<svelte:window
	onkeydowncapture={onDismiss}
	onpointerdowncapture={(e) => !e.composedPath().includes(box) && onDismiss()}
/>

<aside class="resume mono" role="status" bind:this={box}>
	<span>
		<span class="icon">↺</span> resumed {what}{session.settings.media === 'both'
			? ''
			: ` · ${MEDIA_LABELS[session.settings.media]}`}
	</span>
	<span class="muted">
		group {session.gi + 1} of {session.groups.length} · {plural(session.decisionCount, 'decision')} · started
		{timeAgo(session.startedAt)}
	</span>
	<button type="button" onclick={onNew}>new trip instead</button>
</aside>

<style>
	.resume {
		position: fixed;
		top: 52px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 25;
		display: flex;
		align-items: center;
		gap: 14px;
		max-width: calc(100vw - 24px);
		padding: 9px 14px;
		font-size: 12px;
		background: var(--panel2);
		border: 1px solid var(--amber-dim);
		border-radius: 6px;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.5);
		animation: resume-in 200ms ease-out;
	}

	.resume > span {
		white-space: nowrap;
	}

	.icon {
		color: var(--amber);
	}

	button {
		color: var(--amber);
		white-space: nowrap;
	}

	button:hover {
		text-decoration: underline;
	}

	/* Narrow screens: a full-width card under the deck's top bar. */
	@media (max-width: 760px), (pointer: coarse) {
		.resume {
			top: calc(48px + env(safe-area-inset-top));
			left: 12px;
			right: 12px;
			transform: none;
			flex-direction: column;
			align-items: flex-start;
			gap: 6px;
		}

		.resume > span {
			white-space: normal;
		}

		button {
			padding: 6px 0 2px;
		}
	}

	@keyframes resume-in {
		from {
			opacity: 0;
		}
	}
</style>
