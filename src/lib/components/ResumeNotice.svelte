<script lang="ts">
	import { calendarDate, plural, timeAgo } from '$lib/format';
	import { decisionCount, type SessionData } from '$lib/session.svelte';
	import { tripLabel } from '$lib/trips';
	import { MEDIA_LABELS, type SessionSource } from '$lib/types';

	/** What each notice says happened to the session it describes, and the way out it offers. */
	const ACTIONS = { resumed: 'new trip instead', 'set aside': 'back to it' } as const;

	interface Props {
		/** `resumed`: the app reopened the saved session. `set aside`: a deep link opened in its place. */
		kind: keyof typeof ACTIONS;
		session: Pick<SessionData, 'groups' | 'states' | 'gi' | 'startedAt' | 'settings'> & { source: SessionSource | null };
		onAction: () => void;
		onDismiss: () => void;
	}

	/**
	 * Says which saved session the app reopened, or set aside for a deep link, until the user does
	 * anything at all: any key, or a press anywhere outside the notice. Its button offers the way out.
	 */
	let { kind, session, onAction, onDismiss }: Props = $props();

	let box: HTMLElement;

	const what = $derived.by((): string => {
		const { source, groups } = session;
		switch (source?.kind) {
			case 'trip':
				return tripLabel(groups[0].assets[0].localDateTime, source.places);
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
		<span class="icon">↺</span> {kind} {what}{session.settings.media === 'both'
			? ''
			: ` · ${MEDIA_LABELS[session.settings.media]}`}
	</span>
	<span class="muted">
		group {session.gi + 1} of {session.groups.length} · {plural(decisionCount(session), 'decision')} · started
		{timeAgo(session.startedAt)}
	</span>
	<button type="button" onclick={onAction}>{ACTIONS[kind]}</button>
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
