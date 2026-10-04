<script lang="ts" module>
	import type { AlbumResponseDto } from '@immich/sdk';

	/** Fetched once per page load and shared across palette opens. */
	let albumsCache: AlbumResponseDto[] | null = null;
</script>

<script lang="ts">
	import { getAllAlbums, type AssetResponseDto } from '@immich/sdk';
	import { onMount } from 'svelte';
	import { session } from '$lib/session.svelte';
	import { sameAlbum, type AlbumRef, type PaletteScope } from '$lib/types';
	import PaletteShell from './PaletteShell.svelte';

	interface Props {
		/**
		 * 'group': the album this group and the ones after it file their keepers to (one pick, then close).
		 * 'photo': albums for `asset` alone (toggles, stays open).
		 */
		scope: PaletteScope;
		/** The photo the 'photo' scope works on. */
		asset: AssetResponseDto;
		notify: (msg: string) => void;
		onClose: () => void;
	}

	let { scope: initialScope, asset, notify, onClose }: Props = $props();
	let scope = $derived(initialScope);

	interface Option extends AlbumRef {
		create?: true;
		/** "No album": stops the carry-forward from this group on. */
		none?: true;
	}

	let albums = $state.raw<AlbumResponseDto[]>(albumsCache ?? []);
	let loading = $state(albumsCache === null);
	let filter = $state('');

	onMount(() => {
		if (albumsCache !== null) return;
		getAllAlbums({}).then(
			(list) => {
				albumsCache = [...list].sort((a, b) => a.albumName.localeCompare(b.albumName));
				albums = albumsCache;
				loading = false;
			},
			() => {
				albumsCache = [];
				loading = false;
			}
		);
	});

	/** startsWith > includes > in-order subsequence; 0 = no match. */
	const score = (name: string, query: string): number => {
		if (!query) return 1;
		const n = name.toLowerCase();
		if (n.startsWith(query)) return 3;
		if (n.includes(query)) return 2;
		let i = 0;
		for (const ch of n) if (ch === query[i]) i++;
		return i === query.length ? 1 : 0;
	};

	const groupAlbum = $derived(session.groupAlbum());

	const options = $derived.by((): Option[] => {
		const q = filter.trim().toLowerCase();
		// Real albums, plus albums picked earlier this session that only get created at commit.
		const pending = [...session.stagedAlbums, ...session.albumRuns.flatMap((r) => r.album ?? [])]
			.filter((a, i, all) => !a.albumId && all.findIndex((b) => sameAlbum(a, b)) === i)
			.map((a) => ({ name: a.name }));
		const pool: Option[] = [...pending, ...albums.map((a) => ({ albumId: a.id, name: a.albumName }))];
		const matched = pool
			.filter((o) => score(o.name, q) > 0)
			.sort((a, b) => score(b.name, q) - score(a.name, q));
		const exact = pool.some((o) => o.name.toLowerCase() === q);
		const create: Option[] = q && !exact ? [{ name: filter.trim(), create: true }] : [];
		const none: Option[] = scope === 'group' && groupAlbum && !q ? [{ name: 'no album', none: true }] : [];
		return [...create, ...matched, ...none];
	});

	const isOn = (option: Option): boolean => {
		if (option.none) return false;
		if (scope === 'group') return groupAlbum !== null && sameAlbum(groupAlbum, option);
		return session.albumsOf(asset.id).some((a) => sameAlbum(a, option));
	};

	function pick(option: Option) {
		const album = { albumId: option.albumId, name: option.name };
		if (scope === 'group') {
			session.setGroupAlbum(option.none ? null : album);
			notify(option.none ? 'no album from this group on' : `◇ ${option.name} — this group and the ones after it`);
			onClose();
			return;
		}
		const joined = session.togglePhotoAlbum(album, asset.id);
		notify(`${asset.originalFileName} ${joined ? '→' : 'left out of'} ${option.name}`);
	}
</script>

{#snippet row(option: Option)}
	{#if option.create}
		<span class="accent">create "{option.name}"</span>
	{:else if option.none}
		<span class="muted">no album from here on</span>
	{:else}
		<span>{option.name}{option.albumId ? '' : ' (new)'}</span>
	{/if}
	{#if isOn(option)}<span class="check mono">✓</span>{/if}
{/snippet}

<PaletteShell
	label="albums"
	{scope}
	onScope={(s) => (scope = s)}
	scopes={{ group: 'this group onward', photo: 'just this photo' }}
	target={asset.originalFileName}
	bind:filter
	placeholder="filter albums — or type a new name…"
	{options}
	key={(o) => (o.create ? '\0create' : o.none ? '\0none' : (o.albumId ?? o.name))}
	{row}
	status={loading ? 'loading albums…' : undefined}
	empty="no albums"
	enter={scope === 'group' ? 'set' : 'add / remove'}
	onPick={pick}
	{onClose}
/>
