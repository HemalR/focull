<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import {
		checkStitch,
		fetchDuplicateGroups,
		fetchSessionAssets,
		getAuthStatus,
		getServerInfo,
		pickTrip,
		type AuthUser,
		type ServerInfo
	} from '$lib/api';
	import { buildPlan, commitPlan, type CommitPlan } from '$lib/commit';
	import { groupAssets, takenAt } from '$lib/grouping';
	import { setupImmich } from '$lib/immich';
	import { clearSession, loadSession, loadSettings, saveSession } from '$lib/persist';
	import { session, type SessionData, type Tally } from '$lib/session.svelte';
	import { MEDIA_LABELS, type SessionSource } from '$lib/types';
	import { localDate, plural } from '$lib/format';
	import Battle from '$lib/components/Battle.svelte';
	import Swipe from '$lib/components/Swipe.svelte';
	import Cheatsheet from '$lib/components/Cheatsheet.svelte';
	import GroupDone from '$lib/components/GroupDone.svelte';
	import Login from '$lib/components/Login.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import ResumeNotice from '$lib/components/ResumeNotice.svelte';
	import Review from '$lib/components/Review.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import Key from '$lib/components/Key.svelte';
	import { onKey, rebindable } from '$lib/keymap.svelte';
	import { notify, toast } from '$lib/toast.svelte';

	type Phase =
		| 'loading'
		| 'needs-config'
		| 'login'
		| 'picker'
		| 'fetching'
		| 'battle'
		| 'group-done'
		| 'review'
		| 'committing'
		| 'done';

	let phase = $state<Phase>('loading');
	let loadError = $state('');
	let user = $state<AuthUser | null>(null);
	let stitch = $state(false);
	let serverInfo = $state.raw<ServerInfo | null>(null);
	let versionBannerDismissed = $state(false);
	let cheatsheetOpen = $state(false);
	let battleOverlay = $state(false);

	/** Touch screens and narrow windows get the swipe deck; roomy mouse screens the side-by-side panes. */
	const touchUi = new MediaQuery('(pointer: coarse), (max-width: 760px)');
	const BattleUi = $derived(touchUi.current ? Swipe : Battle);

	interface UpdateInfo {
		current: string;
		latest: string | null;
		updateAvailable: boolean;
		url: string | null;
	}
	let updateInfo = $state.raw<UpdateInfo | null>(null);
	let dismissedUpdate = $state('');

	const fetchUpdateInfo = async (): Promise<UpdateInfo | null> => {
		try {
			const res = await fetch('/api/update');
			return res.ok ? ((await res.json()) as UpdateInfo) : null;
		} catch {
			return null;
		}
	};
	/** The session was reopened from device storage — show ResumeNotice until the user does anything. */
	let resumed = $state(false);

	let fetchCount = $state(0);
	let fetchSummary = $state<{ assets: number; groups: number; tripDate?: string } | null>(null);
	let fetchEmpty = $state(false);
	let fetchKind = $state<SessionSource['kind'] | null>(null);
	/** "videos only" while the picker's media filter (F) narrows sessions; empty for both. */
	const mediaNote = $derived(session.settings.media === 'both' ? '' : MEDIA_LABELS[session.settings.media]);
	const emptyMessages: Partial<Record<SessionSource['kind'], string>> = {
		duplicates: 'No duplicates found — your library is already tidy.',
		trip: 'Everything has been reviewed — no memories left to cull.'
	};

	let plan = $state.raw<CommitPlan | null>(null);
	let commitLog = $state<string[]>([]);
	let commitFailed = $state(false);
	let doneSummary = $state<Tally | null>(null);
	let doneReviewed = $state(0);
	/** Groups still to cull after a commit partway through — the done screen offers to carry on. */
	let doneRemaining = $state(0);
	let statsLine = $state('');


	onMount(() => void init());

	async function init() {
		phase = 'loading';
		loadError = '';
		setupImmich();
		session.settings = loadSettings();
		dismissedUpdate = localStorage.getItem('focull.dismissedUpdate') ?? '';
		try {
			const status = await getAuthStatus();
			if (!status.configured) {
				phase = 'needs-config';
				return;
			}
			stitch = await checkStitch();
			if (!status.authenticated) {
				phase = 'login';
				return;
			}
			user = status.user ?? null;
			[serverInfo, updateInfo] = await Promise.all([getServerInfo(), fetchUpdateInfo()]);
			await afterLogin();
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'could not reach the server';
		}
	}

	/** Reopen the saved session; otherwise drop straight into a random trip. */
	async function afterLogin() {
		const saved = await loadSession();
		if (saved) resume(saved);
		else await startTrip();
	}

	// Persist after every battle mutation so a crashed tab can resume.
	$effect(() => {
		void session.rev;
		const data = session.data;
		if (data && (phase === 'battle' || phase === 'group-done')) void saveSession(data);
	});

	function resetFetch(kind: SessionSource['kind']) {
		phase = 'fetching';
		fetchCount = 0;
		fetchSummary = null;
		fetchEmpty = false;
		fetchKind = kind;
	}

	/** A trip down memory lane: a random never-judged photo's scene and the days after it. */
	async function startTrip() {
		resetFetch('trip');
		try {
			const trip = await pickTrip(session.settings);
			if (trip) await startSession(trip);
			else fetchEmpty = true;
		} catch (e) {
			notify(e instanceof Error ? e.message : 'could not pick a trip', true);
			phase = 'picker';
		}
	}

	async function startSession(source: SessionSource) {
		resetFetch(source.kind);
		try {
			let groups =
				source.kind === 'duplicates'
					? await fetchDuplicateGroups(session.settings)
					: groupAssets(
							await fetchSessionAssets(source, session.settings, (n) => (fetchCount = n)),
							session.settings
						);
			if (source.kind === 'trip') {
				// The lead-in only exists to fetch the anchor's whole scene — open on that scene.
				const at = groups.findIndex((g) => g.assets.some((a) => a.id === source.anchorId));
				groups = groups.slice(Math.max(at, 0));
			}
			if (groups.length === 0) {
				fetchEmpty = true;
				return;
			}
			const assetCount = groups.reduce((sum, g) => sum + g.assets.length, 0);
			fetchSummary = {
				assets: assetCount,
				groups: groups.length,
				tripDate: source.kind === 'trip' ? localDate(groups[0].assets[0].localDateTime) : undefined
			};
			session.start(groups, source, session.settings);
			setTimeout(() => {
				if (phase === 'fetching') phase = 'battle';
			}, 900);
		} catch (e) {
			notify(e instanceof Error ? e.message : 'could not fetch assets', true);
			phase = 'picker';
		}
	}

	function resume(saved: SessionData) {
		session.restore(saved);
		const g = session.group;
		const s = session.current;
		if (!g || !s) {
			phase = 'picker';
			return;
		}
		resumed = true;
		if (g.assets.length > 1 && s.queue.length === 0 && !session.skipped.includes(session.gi)) {
			phase = 'group-done'; // finished duel, was waiting on Enter
		} else if (session.isPending(session.gi)) {
			phase = 'battle';
		} else {
			advance();
		}
	}

	/** After a group is settled or skipped: next pending group, or the review screen when none remain. */
	function advance() {
		if (session.gotoNextPending()) {
			phase = 'battle';
		} else {
			plan = computePlan();
			phase = 'review';
		}
	}

	/** Plan over judged groups only — skipped (and unjudged single) groups must stay untouched. */
	function computePlan(): CommitPlan {
		const judged = session.groups.map((_, i) => i).filter((i) => session.isCommittable(i));
		return sanitize(
			buildPlan(
				judged.map((i) => session.groups[i]),
				judged.map((i) => session.states[i]),
				session.settings,
				session.albumAssignments(),
				session.placeAssignments()
			)
		);
	}

	/** buildPlan emits a degenerate [winner, winner] stack for culled single-asset groups — drop those. */
	const sanitize = (p: CommitPlan): CommitPlan => ({
		...p,
		stacks: p.stacks.map((s) => [...new Set(s)]).filter((s) => s.length > 1)
	});

	/** Review & commit the finished groups now; the rest wait, and culling can carry on after. */
	function reviewNow() {
		if (!session.groups.some((_, i) => session.isCommittable(i))) {
			notify('nothing finished yet — finish a group first', true);
			return;
		}
		plan = computePlan();
		phase = 'review';
	}

	/** Back from review, or from a commit partway through, to the groups still waiting. */
	function keepCulling() {
		if (session.isPending(session.gi)) phase = 'battle';
		else advance();
	}

	async function commit() {
		if (!plan) return;
		phase = 'committing';
		commitLog = [];
		commitFailed = false;
		const committing = session.groups.filter((_, i) => session.isCommittable(i));
		try {
			await commitPlan(plan, session.settings, (line) => commitLog.push(line));
			// Only ever advance: trips and ranges into the past must not rewind "new since last cull".
			const newest = Math.max(...committing.flatMap((g) => g.assets.map(takenAt)));
			const lastCull = Date.parse(localStorage.getItem('focull.lastCull') ?? '') || 0;
			if (Number.isFinite(newest) && newest > lastCull) {
				localStorage.setItem('focull.lastCull', new Date(newest).toISOString());
			}
			doneSummary = { ...session.tally };
			doneReviewed = plan.reviewedIds.length;
			statsLine = buildStatsLine(plan);
			doneRemaining = session.pendingCount;
			if (doneRemaining > 0) {
				session.markCommitted();
				const data = session.data;
				if (data) void saveSession(data);
			} else {
				void clearSession();
			}
			phase = 'done';
		} catch (e) {
			commitLog.push(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
			commitFailed = true;
		}
	}

	/** One mono line of session stats: "214 assets · 38 min · 5.6 decisions/min · 71% culled". */
	function buildStatsLine(p: CommitPlan): string {
		const assets = p.reviewedIds.length;
		if (assets === 0) return '';
		const minutes = Math.max((Date.now() - session.startedAt) / 60_000, 1 / 60);
		const decisions = session.decisionCount;
		const dpm = decisions / minutes;
		const culledPct = Math.round((p.rejectIds.length / assets) * 100);
		const minuteStr = minutes < 1 ? '<1 min' : `${Math.round(minutes)} min`;
		return `${assets} assets · ${minuteStr} · ${dpm >= 10 ? Math.round(dpm) : dpm.toFixed(1)} decisions/min · ${culledPct}% culled`;
	}

	// Leaving a session behind (e.g. after a commit partway through) also forgets the saved copy.
	function newSession() {
		session.reset();
		void clearSession();
		phase = 'picker';
	}

	function newTrip() {
		session.reset();
		void clearSession();
		void startTrip();
	}

	function escapeOut() {
		if (phase === 'committing') {
			phase = 'review';
			return;
		}
		if (phase === 'done' || (phase === 'fetching' && fetchEmpty)) {
			newSession();
			return;
		}
		if (phase === 'review' && session.pendingCount > 0) {
			keepCulling();
			return;
		}
		if (abandon()) phase = 'picker';
	}

	/** Drop the current session, confirming first if it holds decisions. Returns whether it was dropped. */
	function abandon(): boolean {
		if (session.hasDecisions && !confirm('Abandon this session? Your decisions will be lost.')) return false;
		session.reset();
		void clearSession();
		return true;
	}

	createHotkey('Escape', escapeOut, () => ({
		conflictBehavior: 'allow',
		enabled:
			!cheatsheetOpen &&
			!battleOverlay &&
			(phase === 'battle' ||
				phase === 'group-done' ||
				phase === 'review' ||
				phase === 'done' ||
				(phase === 'fetching' && fetchEmpty) ||
				(phase === 'committing' && commitFailed))
	}));

	// '?' needs shift on most layouts but not all — register both variants.
	createHotkey({ key: '?', shift: true }, () => (cheatsheetOpen = !cheatsheetOpen), {
		conflictBehavior: 'allow'
	});
	createHotkey({ key: '?' }, () => (cheatsheetOpen = !cheatsheetOpen), {
		conflictBehavior: 'allow'
	});

	onKey(
		'confirm',
		() => {
			if (phase === 'fetching') newSession();
			else if (phase === 'committing') void commit();
			else if (phase === 'done') (doneRemaining > 0 ? keepCulling : newTrip)();
		},
		() => ({
			enabled:
				phase === 'done' ||
				(phase === 'fetching' && fetchEmpty) ||
				(phase === 'committing' && commitFailed)
		})
	);

	onKey('pickSession', newSession, () => ({ enabled: phase === 'done' }));
</script>

{#if phase === 'loading'}
	<div class="center-screen">
		<div class="mini">
			<span class="brand">focull<span class="dot">.</span></span>
			{#if loadError}
				<p class="err mono">{loadError}</p>
				<button type="button" class="btn" onclick={() => void init()}>retry</button>
			{:else}
				<p class="muted mono">loading…</p>
			{/if}
		</div>
	</div>
{:else if phase === 'needs-config'}
	<div class="center-screen">
		<div class="card notice">
			<span class="brand">focull<span class="dot">.</span></span>
			<h1>Immich is not configured</h1>
			<p class="muted">
				focull needs to know where your Immich server lives. Set the
				<code class="mono">IMMICH_URL</code> environment variable (e.g.
				<code class="mono">IMMICH_URL=http://immich:2283</code>) and restart focull.
			</p>
		</div>
	</div>
{:else if phase === 'login'}
	<Login
		onSuccess={(u) => {
			user = u;
			void getServerInfo().then((info) => (serverInfo = info));
			void fetchUpdateInfo().then((info) => (updateInfo = info));
			void afterLogin();
		}}
	/>
{:else if phase === 'picker'}
	<Picker
		{user}
		stitchAvailable={stitch}
		{serverInfo}
		showVersionBanner={serverInfo !== null && !serverInfo.compatible && !versionBannerDismissed}
		onDismissBanner={() => (versionBannerDismissed = true)}
		{updateInfo}
		showUpdateBanner={updateInfo?.updateAvailable === true &&
			updateInfo.latest !== null &&
			updateInfo.latest !== dismissedUpdate}
		onDismissUpdate={() => {
			if (updateInfo?.latest) {
				dismissedUpdate = updateInfo.latest;
				localStorage.setItem('focull.dismissedUpdate', updateInfo.latest);
			}
		}}
		onStart={(source) => void startSession(source)}
		onTrip={() => void startTrip()}
		onLogout={() => {
			user = null;
			phase = 'login';
		}}
		onHelp={() => (cheatsheetOpen = true)}
	/>
{:else if phase === 'fetching'}
	<div class="center-screen">
		<div class="mini">
			<span class="brand">focull<span class="dot">.</span></span>
			{#if fetchEmpty}
				<p class="mono">
					{(fetchKind && emptyMessages[fetchKind]) ?? 'No assets match — nothing to cull. Nice and tidy.'}
				</p>
				{#if mediaNote}
					<p class="mono muted">{mediaNote} — <Key action="media" /> in the picker changes that</p>
				{/if}
				<button type="button" class="btn" onclick={newSession} {@attach rebindable('confirm')}>
					back to picker <Key action="confirm" />
				</button>
			{:else if fetchSummary}
				{#if fetchSummary.tripDate}
					<p class="mono trip">a trip back to {fetchSummary.tripDate}</p>
				{/if}
				<p class="mono summary">
					{plural(fetchSummary.assets, 'asset')} → {plural(fetchSummary.groups, 'group')}{mediaNote &&
						` · ${mediaNote}`}
				</p>
			{:else}
				<p class="muted mono">
					{fetchKind === 'trip' && fetchCount === 0 ? 'picking a memory…' : `fetching assets… ${fetchCount || ''}`}
				</p>
			{/if}
		</div>
	</div>
{:else if phase === 'battle' || phase === 'group-done'}
	<BattleUi
		active={phase === 'battle' && !cheatsheetOpen}
		stitchAvailable={stitch}
		{notify}
		onGroupDone={() => (phase = 'group-done')}
		onSingleDone={advance}
		onSkipped={advance}
		onHelp={() => (cheatsheetOpen = true)}
		onExit={escapeOut}
		onReview={reviewNow}
		onOverlay={(open) => (battleOverlay = open)}
	/>
	{#if phase === 'group-done'}
		<GroupDone
			last={!session.states.some((_, i) => i > session.gi && session.isPending(i))}
			{notify}
			onNext={advance}
			onReopen={() => (phase = 'battle')}
			onOverlay={(open) => (battleOverlay = open)}
			onReview={reviewNow}
		/>
	{/if}
{:else if phase === 'review' && plan}
	<Review
		{plan}
		stitchAvailable={stitch}
		{notify}
		onChanged={() => (plan = computePlan())}
		onCommit={() => void commit()}
		onExit={escapeOut}
		left={session.pendingCount}
	/>
{:else if phase === 'committing'}
	<div class="center-screen">
		<div class="card notice wide">
			<span class="label">committing to immich</span>
			<ul class="log mono">
				{#each commitLog as line, i (i)}
					<li class={[line.startsWith('ERROR') && 'err']}>{line}</li>
				{/each}
				{#if !commitFailed}
					<li class="muted">…</li>
				{/if}
			</ul>
			{#if commitFailed}
				<div class="row-btns">
					<button type="button" class="btn" onclick={() => void commit()} {@attach rebindable('confirm')}>
						retry <Key action="confirm" />
					</button>
					<button type="button" class="ghost mono" onclick={escapeOut}><kbd>esc</kbd> back to review</button>
				</div>
			{/if}
		</div>
	</div>
{:else if phase === 'done'}
	<div class="center-screen">
		<div class="card notice">
			<span class="brand">focull<span class="dot">.</span></span>
			<h1>{doneReviewed === 0 ? 'Nothing committed' : doneRemaining > 0 ? 'Progress committed' : 'Session committed'}</h1>
			{#if doneReviewed === 0}
				<p class="mono muted">every group was skipped — the library is untouched</p>
			{/if}
			{#if doneSummary && doneReviewed > 0}
				<p class="mono">
					<span class="k">✓ {doneSummary.kept} kept</span> ·
					<span class="c">✕ {doneSummary.culled} culled</span> ·
					<span class="r">◉ {doneSummary.reel} reel</span>
				</p>
			{/if}
			{#if statsLine}
				<p class="mono muted">{statsLine}</p>
			{/if}
			{#if doneReviewed > 0}
				<p class="mono muted">
					{plural(doneReviewed, 'asset')} now carry #{session.settings.reviewedTagName} — future
					sessions skip them
				</p>
			{/if}
			<ul class="log mono">
				{#each commitLog as line, i (i)}<li>{line}</li>{/each}
			</ul>
			<div class="row-btns">
				{#if doneRemaining > 0}
					<button type="button" class="btn" onclick={keepCulling} {@attach rebindable('confirm')}>
						keep culling — {plural(doneRemaining, 'group')} left <Key action="confirm" />
					</button>
					<button type="button" class="ghost mono" onclick={newTrip}>another trip</button>
				{:else}
					<button type="button" class="btn" onclick={newTrip} {@attach rebindable('confirm')}>
						another trip <Key action="confirm" />
					</button>
				{/if}
				<button type="button" class="ghost mono" onclick={newSession} {@attach rebindable('pickSession')}>
					<Key action="pickSession" /> pick a session
				</button>
			</div>
		</div>
	</div>
{/if}

{#if resumed}
	<ResumeNotice
		onNew={() => {
			if (!abandon()) return;
			resumed = false;
			void startTrip();
		}}
		onDismiss={() => (resumed = false)}
	/>
{/if}

{#if cheatsheetOpen}
	<Cheatsheet onClose={() => (cheatsheetOpen = false)} />
{/if}

<Toast toast={toast.current} />

<style>
	.mini {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}

	.notice {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(460px, 92vw);
		padding: 28px 32px;
	}

	.notice.wide {
		width: min(640px, 92vw);
	}

	.notice h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}

	.notice p {
		margin: 0;
	}

	code {
		color: var(--amber);
	}

	.err {
		color: var(--rej);
		margin: 0;
	}

	.summary {
		font-size: 15px;
		color: var(--amber);
	}

	.trip {
		font-size: 15px;
		margin: 0;
	}

	.row-btns {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--mut);
		padding: 6px 4px;
	}

	.ghost:hover {
		color: var(--ink);
	}

	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 300px;
		overflow-y: auto;
		font-size: 12px;
	}

	.log .err {
		color: var(--rej);
	}

	.k {
		color: var(--keep);
	}

	.c {
		color: var(--rej);
	}

	.r {
		color: var(--reel);
	}
</style>
