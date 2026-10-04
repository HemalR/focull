<script lang="ts">
	import { getAllAlbums, type AlbumResponseDto } from '@immich/sdk';
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { logout, TESTED_IMMICH_MAJOR, type AuthUser, type ServerInfo } from '$lib/api';
	import { calendarDate, isoDaysAgo, plural } from '$lib/format';
	import { session } from '$lib/session.svelte';
	import type { SessionSource } from '$lib/types';
	import SettingsModal from './SettingsModal.svelte';
	import { onKey, rebindable } from '$lib/keymap.svelte';
	import Key from './Key.svelte';
	import KeyLegend from './KeyLegend.svelte';

	interface UpdateInfo {
		current: string;
		latest: string | null;
		updateAvailable: boolean;
		url: string | null;
	}

	interface Props {
		user: AuthUser | null;
		stitchAvailable: boolean;
		serverInfo: ServerInfo | null;
		showVersionBanner: boolean;
		onDismissBanner: () => void;
		updateInfo: UpdateInfo | null;
		showUpdateBanner: boolean;
		onDismissUpdate: () => void;
		onStart: (source: SessionSource) => void;
		/** Random trip down memory lane — the source the app opens on. */
		onTrip: () => void;
		onLogout: () => void;
		onHelp: () => void;
	}

	let {
		user,
		stitchAvailable,
		serverInfo,
		showVersionBanner,
		onDismissBanner,
		updateInfo,
		showUpdateBanner,
		onDismissUpdate,
		onStart,
		onTrip,
		onLogout,
		onHelp
	}: Props = $props();

	let mode = $state<'none' | 'album' | 'range'>('none');
	let settingsOpen = $state(false);

	const lastCull = localStorage.getItem('focull.lastCull');
	const since = lastCull ?? isoDaysAgo(30);

	// --- albums ---
	let albums = $state.raw<AlbumResponseDto[]>([]);
	let albumsState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let filter = $state('');
	let highlight = $state(0);

	const filtered = $derived(
		albums.filter((a) => a.albumName.toLowerCase().includes(filter.toLowerCase()))
	);
	const hl = $derived(Math.min(highlight, filtered.length - 1));

	async function openAlbums() {
		mode = 'album';
		if (albumsState === 'ready' || albumsState === 'loading') return;
		albumsState = 'loading';
		try {
			albums = [...(await getAllAlbums({}))].sort((a, b) => a.albumName.localeCompare(b.albumName));
			albumsState = 'ready';
		} catch {
			albumsState = 'error';
		}
	}

	function pickAlbum(album: AlbumResponseDto | undefined) {
		if (album) onStart({ kind: 'album', albumId: album.id, albumName: album.albumName });
	}

	// --- date range ---
	let from = $state(isoDaysAgo(30).slice(0, 10));
	let to = $state(new Date().toISOString().slice(0, 10));

	function startRange() {
		if (!from || !to) return;
		onStart({
			kind: 'range',
			takenAfter: new Date(`${from}T00:00:00`).toISOString(),
			takenBefore: new Date(`${to}T23:59:59.999`).toISOString()
		});
	}

	function confirmEnter() {
		if (mode === 'album') pickAlbum(filtered[hl]);
		else if (mode === 'range') startRange();
	}

	const startUnreviewed = () => onStart({ kind: 'unreviewed' });
	const startNew = () => onStart({ kind: 'new', takenAfter: since });
	const startDuplicates = () => onStart({ kind: 'duplicates' });
	const openRange = () => (mode = 'range');
	const openSettings = () => (settingsOpen = true);

	const closed = () => ({ enabled: !settingsOpen });
	onKey('trip', () => onTrip(), closed);
	onKey('unreviewed', startUnreviewed, closed);
	onKey('newSince', startNew, closed);
	onKey('pickAlbum', () => void openAlbums(), closed);
	onKey('range', openRange, closed);
	onKey('duplicates', startDuplicates, closed);
	onKey('settings', openSettings, closed);
	createHotkey('Escape', () => (mode = 'none'), () => ({
		conflictBehavior: 'allow',
		enabled: !settingsOpen && mode !== 'none'
	}));
	// The album list and range form keep the standard ↑ ↓ ↵ — they're form keys, not shortcuts.
	createHotkey(
		'ArrowDown',
		() => (highlight = Math.min(highlight + 1, filtered.length - 1)),
		() => ({ enabled: !settingsOpen && mode === 'album', ignoreInputs: false })
	);
	createHotkey(
		'ArrowUp',
		() => (highlight = Math.max(highlight - 1, 0)),
		() => ({ enabled: !settingsOpen && mode === 'album', ignoreInputs: false })
	);
	createHotkey('Enter', confirmEnter, () => ({
		enabled: !settingsOpen && mode !== 'none',
		ignoreInputs: false,
		conflictBehavior: 'allow'
	}));
</script>

<div class="picker">
	<header>
		<span class="brand">focull<span class="dot">.</span></span>
		<span class="who mono muted">
			{#if user}{user.name} · <button type="button" class="link" onclick={() => void logout().then(onLogout)}>log out</button>{/if}
		</span>
	</header>

	<main>
		{#if showVersionBanner && serverInfo}
			<div class="banner">
				<span class="mono">
					Untested against this Immich version (built for v{TESTED_IMMICH_MAJOR}.x) — review
					commits carefully.
				</span>
				<button type="button" class="dismiss mono" onclick={onDismissBanner} title="dismiss">✕</button>
			</div>
		{/if}

		{#if showUpdateBanner && updateInfo?.latest}
			<div class="banner update">
				<span class="mono">
					focull v{updateInfo.latest} is available{#if updateInfo.url}
						· <a href={updateInfo.url} target="_blank" rel="noopener">release notes</a>{/if}
				</span>
				<button type="button" class="dismiss mono" onclick={onDismissUpdate} title="dismiss">✕</button>
			</div>
		{/if}

		<h1 class="label">pick a session source</h1>

		<div class="sources">
			<button type="button" class={['card', 'source']} onclick={onTrip} {@attach rebindable('trip')}>
				<Key action="trip" />
				<strong>Random trip</strong>
				<span class="muted mono">a few random days of unreviewed photos — relive and cull</span>
			</button>

			<button type="button" class={['card', 'source']} onclick={startUnreviewed} {@attach rebindable('unreviewed')}>
				<Key action="unreviewed" />
				<strong>Unreviewed</strong>
				<span class="muted mono">
					everything you've never judged — skips anything tagged
					{session.settings.reviewedTagName} or {session.settings.tagName}
				</span>
			</button>

			<button type="button" class={['card', 'source']} onclick={startNew} {@attach rebindable('newSince')}>
				<Key action="newSince" />
				<strong>New since last cull</strong>
				<span class="muted mono">since {calendarDate(since)}{lastCull ? '' : ' (no cull yet — 30 days)'}</span>
			</button>

			<button
				type="button"
				class={['card', 'source', mode === 'album' && 'active']}
				onclick={openAlbums}
				{@attach rebindable('pickAlbum')}
			>
				<Key action="pickAlbum" />
				<strong>Album</strong>
				<span class="muted mono">battle one album</span>
			</button>

			<button
				type="button"
				class={['card', 'source', mode === 'range' && 'active']}
				onclick={openRange}
				{@attach rebindable('range')}
			>
				<Key action="range" />
				<strong>Date range</strong>
				<span class="muted mono">a specific stretch of time</span>
			</button>

			<button type="button" class={['card', 'source']} onclick={startDuplicates} {@attach rebindable('duplicates')}>
				<Key action="duplicates" />
				<strong>Duplicates</strong>
				<span class="muted mono">
					Immich's visual duplicate groups — suggested keeper opens as champion
				</span>
			</button>
		</div>

		{#if mode === 'album'}
			<div class="card detail">
				{#if albumsState === 'loading'}
					<p class="muted mono">loading albums…</p>
				{:else if albumsState === 'error'}
					<p class="err mono">could not load albums</p>
				{:else}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						placeholder="filter albums…"
						autofocus
						bind:value={filter}
						oninput={() => (highlight = 0)}
					/>
					<ul>
						{#each filtered as album, i (album.id)}
							<li>
								<button
									type="button"
									class={['row', i === hl && 'hl']}
									onclick={() => pickAlbum(album)}
									{@attach (el) => {
										if (i === hl) el.scrollIntoView({ block: 'nearest' });
									}}
								>
									<span>{album.albumName}</span>
									<span class="muted mono">{plural(album.assetCount, 'asset')}</span>
								</button>
							</li>
						{:else}
							<li class="muted mono empty">no matching albums</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if mode === 'range'}
			<div class="card detail range">
				<label class="label">from <input type="date" bind:value={from} max={to} /></label>
				<label class="label">to <input type="date" bind:value={to} min={from} /></label>
				<button type="button" class="btn" onclick={startRange}>start ↵</button>
			</div>
		{/if}

		{#if !stitchAvailable}
			<p class="muted mono stitch-note">video stitching is off — ffmpeg was not found on the server.</p>
		{/if}

		<p class="muted mono stitch-note">
			focull v{__APP_VERSION__}{serverInfo ? ` · Immich ${serverInfo.version}` : ''}
		</p>
	</main>

	<KeyLegend
		items={[
			{ action: 'trip', label: 'random trip', run: onTrip },
			{ action: 'unreviewed', label: 'unreviewed', run: startUnreviewed },
			{ action: 'newSince', label: 'new since last cull', run: startNew },
			{ action: 'pickAlbum', label: 'album', run: () => void openAlbums() },
			{ action: 'range', label: 'date range', run: openRange },
			{ action: 'duplicates', label: 'duplicates', run: startDuplicates },
			{ action: 'settings', label: 'settings', run: openSettings },
			{ keys: '?', label: 'shortcuts', run: onHelp }
		]}
		notes={['nothing is deleted until you commit']}
	/>
</div>

{#if settingsOpen}
	<SettingsModal {stitchAvailable} onClose={() => (settingsOpen = false)} />
{/if}

<style>
	.picker {
		height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
	}

	.link {
		color: var(--mut);
		text-decoration: underline;
		font-family: var(--mono);
		font-size: 12px;
	}

	.link:hover {
		color: var(--ink);
	}

	main {
		overflow-y: auto;
		padding: 40px 24px;
		width: min(900px, 100%);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		border: 1px solid var(--amber-dim);
		border-radius: 5px;
		background: color-mix(in srgb, var(--amber) 8%, var(--panel));
		color: var(--amber);
		font-size: 12px;
	}

	.dismiss {
		color: var(--amber);
		padding: 2px 6px;
	}

	.dismiss:hover {
		color: var(--ink);
	}

	.banner.update {
		border-color: var(--line);
		background: var(--panel);
		color: var(--mut);
	}

	.banner.update a {
		color: var(--amber);
	}

	.banner.update .dismiss {
		color: var(--mut);
	}

	h1 {
		margin: 0;
		font-size: 11px;
	}

	.sources {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 12px;
	}

	.source {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 16px;
		text-align: left;
	}

	.source:hover,
	.source.active {
		border-color: var(--amber-dim);
	}

	@media (max-width: 760px) {
		main {
			padding: 20px 12px;
		}
	}

	.detail {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.detail input[type='text'] {
		width: 100%;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 260px;
		overflow-y: auto;
	}

	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		padding: 8px 10px;
		border-radius: 4px;
		text-align: left;
	}

	.row:hover {
		background: var(--panel2);
	}

	.row.hl {
		background: var(--panel2);
		outline: 1px solid var(--amber-dim);
	}

	.empty {
		padding: 8px 10px;
	}

	.range {
		flex-direction: row;
		align-items: end;
		gap: 16px;
	}

	.range label {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.err {
		color: var(--rej);
		margin: 0;
	}

	.stitch-note {
		margin: 0;
		font-size: 11px;
	}

	p {
		margin: 0;
	}
</style>
