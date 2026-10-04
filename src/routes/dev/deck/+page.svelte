<script lang="ts">
	// TEMPORARY dev-only page: the swipe deck over sample groups, with callbacks logged to window.__log.
	import { untrack } from 'svelte';
	import { buildPlan } from '$lib/commit';
	import GroupDone from '$lib/components/GroupDone.svelte';
	import Review from '$lib/components/Review.svelte';
	import Cheatsheet from '$lib/components/Cheatsheet.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { toast } from '$lib/toast.svelte';
	import Swipe from '$lib/components/Swipe.svelte';
	import Battle from '$lib/components/Battle.svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { session } from '$lib/session.svelte';
	import { DEFAULT_SETTINGS } from '$lib/types';

	let { data } = $props();
	const log: string[] = [];
	(window as unknown as { __log: string[] }).__log = log;
	untrack(() =>
		session.start(data.groups, { kind: 'trip', anchorId: '', takenAfter: '', takenBefore: '' }, DEFAULT_SETTINGS)
	);
	const touchUi = new MediaQuery('(pointer: coarse), (max-width: 760px)');
	const BattleUi = $derived(touchUi.current ? Swipe : Battle);
	let phase = $state<'battle' | 'group-done' | 'review'>('battle');
	let help = $state(false);
	const next = () => {
		phase = session.gotoNextPending() ? 'battle' : 'review';
		log.push(phase);
	};
	const plan = $derived(
		phase === 'review' ? buildPlan(session.groups, session.states, session.settings, session.albumAssignments(), session.placeAssignments()) : null
	);
</script>

{#if plan}
	<Review {plan} stitchAvailable={true} notify={(m) => log.push(m)} onChanged={() => {}} onCommit={() => log.push('commit')} onExit={() => log.push('exit')} left={session.pendingCount} />
{:else}

<BattleUi
	active={phase === 'battle'}
	stitchAvailable={true}
	notify={(msg) => log.push(msg)}
	onGroupDone={() => (phase = 'group-done')}
	onSingleDone={next}
	onSkipped={next}
	onHelp={() => (help = true)}
	onExit={() => log.push('exit')}
	onReview={() => (phase = 'review')}
	onOverlay={(open) => log.push(`overlay ${open}`)}
/>
{#if phase === 'group-done'}
	<GroupDone last={false} notify={(m) => log.push(m)} onNext={next} onReopen={() => (phase = 'battle')} onOverlay={(o) => log.push(`overlay ${o}`)} onReview={() => (phase = 'review')} />
{/if}
{/if}

{#if help}<Cheatsheet onClose={() => (help = false)} />{/if}
<Toast toast={toast.current} />
