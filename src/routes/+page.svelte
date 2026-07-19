<script lang="ts">
	import { onMount } from 'svelte';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { checkStitch, fetchSessionAssets, getAuthStatus, type AuthUser } from '$lib/api';
	import { buildPlan, commitPlan, type CommitPlan } from '$lib/commit';
	import { groupAssets, takenAt } from '$lib/grouping';
	import { setupImmich } from '$lib/immich';
	import { clearSession, loadSession, saveSession } from '$lib/persist';
	import { session, type SessionData, type Tally } from '$lib/session.svelte';
	import { DEFAULT_SETTINGS, type SessionSource, type Settings } from '$lib/types';
	import { plural } from '$lib/format';
	import Battle from '$lib/components/Battle.svelte';
	import GroupDone from '$lib/components/GroupDone.svelte';
	import Login from '$lib/components/Login.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import Review from '$lib/components/Review.svelte';
	import Toast, { type ToastData } from '$lib/components/Toast.svelte';

	type Phase =
		| 'loading'
		| 'needs-config'
		| 'login'
		| 'resume'
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
	let saved = $state.raw<SessionData | null>(null);

	let fetchCount = $state(0);
	let fetchSummary = $state<{ assets: number; groups: number } | null>(null);
	let fetchEmpty = $state(false);

	let plan = $state.raw<CommitPlan | null>(null);
	let commitLog = $state<string[]>([]);
	let commitFailed = $state(false);
	let doneSummary = $state<Tally | null>(null);
	let doneReviewed = $state(0);

	let toast = $state<ToastData | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	function notify(msg: string, err = false) {
		toast = { msg, err };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 1600);
	}

	onMount(() => void init());

	async function init() {
		phase = 'loading';
		loadError = '';
		setupImmich();
		session.settings = loadSettings();
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
			saved = (await loadSession()) ?? null;
			phase = saved ? 'resume' : 'picker';
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'could not reach the server';
		}
	}

	function loadSettings(): Settings {
		try {
			const raw = localStorage.getItem('focull.settings');
			return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	// Persist after every battle mutation so a crashed tab can resume.
	$effect(() => {
		void session.rev;
		const data = session.data;
		if (data && (phase === 'battle' || phase === 'group-done')) void saveSession(data);
	});

	async function startSession(source: SessionSource) {
		phase = 'fetching';
		fetchCount = 0;
		fetchSummary = null;
		fetchEmpty = false;
		try {
			const assets = await fetchSessionAssets(source, session.settings, (n) => (fetchCount = n));
			if (assets.length === 0) {
				fetchEmpty = true;
				return;
			}
			const groups = groupAssets(assets, session.settings);
			fetchSummary = { assets: assets.length, groups: groups.length };
			session.start(groups, source, session.settings);
			setTimeout(() => {
				if (phase === 'fetching') phase = 'battle';
			}, 900);
		} catch (e) {
			notify(e instanceof Error ? e.message : 'could not fetch assets', true);
			phase = 'picker';
		}
	}

	function resume() {
		if (!saved) return;
		session.restore(saved);
		saved = null;
		const g = session.group;
		const s = session.current;
		if (!g || !s) {
			phase = 'picker';
		} else if (g.assets.length === 1 && s.fates[0] !== undefined) {
			advance();
		} else if (g.assets.length > 1 && s.queue.length === 0) {
			phase = 'group-done';
		} else {
			phase = 'battle';
		}
	}

	function discardSaved() {
		saved = null;
		void clearSession();
		phase = 'picker';
	}

	/** After a group is settled: next duel, or the review screen when it was the last. */
	function advance() {
		if (session.gi + 1 < session.groups.length) {
			session.next();
			phase = 'battle';
		} else {
			plan = sanitize(buildPlan(session.groups, session.states, session.settings));
			phase = 'review';
		}
	}

	/** buildPlan emits a degenerate [winner, winner] stack for culled single-asset groups — drop those. */
	const sanitize = (p: CommitPlan): CommitPlan => ({
		...p,
		stacks: p.stacks.map((s) => [...new Set(s)]).filter((s) => s.length > 1)
	});

	async function commit() {
		if (!plan) return;
		phase = 'committing';
		commitLog = [];
		commitFailed = false;
		try {
			await commitPlan(plan, session.settings, (line) => commitLog.push(line));
			const newest = Math.max(...session.groups.flatMap((g) => g.assets.map(takenAt)));
			if (Number.isFinite(newest)) {
				localStorage.setItem('focull.lastCull', new Date(newest).toISOString());
			}
			doneSummary = { ...session.tally };
			doneReviewed = plan.reviewedIds.length;
			void clearSession();
			phase = 'done';
		} catch (e) {
			commitLog.push(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
			commitFailed = true;
		}
	}

	function newSession() {
		session.reset();
		phase = 'picker';
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
		if (session.hasDecisions && !confirm('Abandon this session? Your decisions will be lost.')) {
			return;
		}
		session.reset();
		void clearSession();
		phase = 'picker';
	}

	createHotkey('Escape', escapeOut, () => ({
		conflictBehavior: 'allow',
		enabled:
			phase === 'battle' ||
			phase === 'group-done' ||
			phase === 'review' ||
			phase === 'done' ||
			(phase === 'fetching' && fetchEmpty) ||
			(phase === 'committing' && commitFailed)
	}));

	createHotkey(
		'Enter',
		() => {
			if (phase === 'resume') resume();
			else if (phase === 'fetching') newSession();
			else if (phase === 'committing') void commit();
		},
		() => ({
			conflictBehavior: 'allow',
			enabled:
				phase === 'resume' ||
				(phase === 'fetching' && fetchEmpty) ||
				(phase === 'committing' && commitFailed)
		})
	);

	createHotkey('N', discardSaved, () => ({ enabled: phase === 'resume' }));
	createHotkey('R', newSession, () => ({ enabled: phase === 'done' }));
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
			void loadSession().then((s) => {
				saved = s ?? null;
				phase = saved ? 'resume' : 'picker';
			});
		}}
	/>
{:else if phase === 'resume'}
	<div class="center-screen">
		<div class="card notice">
			<span class="brand">focull<span class="dot">.</span></span>
			<h1>Resume last session?</h1>
			{#if saved}
				<p class="muted mono">
					{plural(saved.groups.length, 'group')} · group {saved.gi + 1} was up next
				</p>
			{/if}
			<div class="row-btns">
				<button type="button" class="btn" onclick={resume}>resume ↵</button>
				<button type="button" class="ghost mono" onclick={discardSaved}><kbd>N</kbd> new session</button>
			</div>
		</div>
	</div>
{:else if phase === 'picker'}
	<Picker
		{user}
		stitchAvailable={stitch}
		onStart={(source) => void startSession(source)}
		onLogout={() => {
			user = null;
			phase = 'login';
		}}
	/>
{:else if phase === 'fetching'}
	<div class="center-screen">
		<div class="mini">
			<span class="brand">focull<span class="dot">.</span></span>
			{#if fetchEmpty}
				<p class="mono">No assets match — nothing to cull. Nice and tidy.</p>
				<button type="button" class="btn" onclick={newSession}>back to picker ↵</button>
			{:else if fetchSummary}
				<p class="mono summary">
					{plural(fetchSummary.assets, 'asset')} → {plural(fetchSummary.groups, 'group')}
				</p>
			{:else}
				<p class="muted mono">fetching assets… {fetchCount > 0 ? fetchCount : ''}</p>
			{/if}
		</div>
	</div>
{:else if phase === 'battle' || phase === 'group-done'}
	<Battle
		active={phase === 'battle'}
		stitchAvailable={stitch}
		{notify}
		onGroupDone={() => (phase = 'group-done')}
		onSingleDone={advance}
	/>
	{#if phase === 'group-done'}
		<GroupDone last={session.gi + 1 >= session.groups.length} onNext={advance} />
	{/if}
{:else if phase === 'review' && plan}
	<Review {plan} onCommit={() => void commit()} />
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
				<p class="mono muted">enter — retry · esc — back to review</p>
			{/if}
		</div>
	</div>
{:else if phase === 'done'}
	<div class="center-screen">
		<div class="card notice">
			<span class="brand">focull<span class="dot">.</span></span>
			<h1>Session committed</h1>
			{#if doneSummary}
				<p class="mono">
					<span class="k">✓ {doneSummary.kept} kept</span> ·
					<span class="c">✕ {doneSummary.culled} culled</span> ·
					<span class="r">◉ {doneSummary.reel} reel</span>
				</p>
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
			<button type="button" class="ghost mono" onclick={newSession}><kbd>R</kbd> new session</button>
		</div>
	</div>
{/if}

<Toast {toast} />

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
