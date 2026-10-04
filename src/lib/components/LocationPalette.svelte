<script lang="ts">
	import type { AssetResponseDto } from '@immich/sdk';
	import { plural } from '$lib/format';
	import { takenAt } from '$lib/grouping';
	import { findPlaces, lacksLocation, nearbyPlaces, type FoundPlace } from '$lib/places';
	import { session } from '$lib/session.svelte';
	import { notify } from '$lib/toast.svelte';
	import type { PaletteScope, Place } from '$lib/types';
	import PaletteShell from './PaletteShell.svelte';

	interface Props {
		/**
		 * 'group': the place for this group's photos that have no location.
		 * 'photo': a place for `asset` alone, even if it has one. Either way it's set at commit.
		 */
		scope: PaletteScope;
		/** The photo the 'photo' scope works on. */
		asset: AssetResponseDto;
		onClose: () => void;
	}

	let { scope: initialScope, asset, onClose }: Props = $props();
	let scope = $derived(initialScope);

	/** A place to pick (`nearby`: where nearby photos were), or null to undo a pick. */
	interface Option {
		place: FoundPlace | null;
		nearby?: true;
	}

	const group = $derived(session.group);
	let filter = $state('');
	let results = $state.raw<FoundPlace[]>([]);
	let searching = $state(false);

	// Immich's place search, once typing pauses.
	$effect(() => {
		const q = filter.trim();
		if (q.length < 2) {
			results = [];
			return;
		}
		searching = true;
		const timer = setTimeout(() => {
			findPlaces(q).then(
				(found) => {
					if (filter.trim() !== q) return;
					results = found;
					searching = false;
				},
				() => {
					results = [];
					searching = false;
				}
			);
		}, 200);
		return () => clearTimeout(timer);
	});

	const sameSpot = (a: Place, b: Place) => a.latitude === b.latitude && a.longitude === b.longitude;

	/** The photo nearby suggestions are measured from: this one, or the group's first without a location. */
	const reference = $derived(scope === 'photo' ? asset : (group?.assets.find(lacksLocation) ?? asset));
	const nearby = $derived(
		nearbyPlaces(
			session.groups.flatMap((g) => g.assets).filter((a) => a.id !== reference.id),
			takenAt(reference)
		)
	);

	const current = $derived(
		scope === 'group' ? (group && session.groupPlaces[group.id]) || null : session.plannedPlace(asset)
	);
	const undoable = $derived(scope === 'group' ? current !== null : session.photoPlaces[asset.id] !== undefined || current !== null);

	const options = $derived.by((): Option[] => {
		if (filter.trim().length >= 2) return results.map((place) => ({ place }));
		return [...nearby.map((place) => ({ place, nearby: true as const })), ...(undoable ? [{ place: null }] : [])];
	});

	function pick({ place }: Option) {
		if (!place) {
			if (scope === 'group') session.setGroupPlace(null);
			else session.setPhotoPlace(asset.id, null);
			notify(scope === 'group' ? 'group location forgotten' : `${asset.originalFileName} keeps its own location`);
		} else {
			const chosen: Place = { latitude: place.latitude, longitude: place.longitude, label: place.label };
			if (scope === 'group') {
				const n = session.setGroupPlace(chosen);
				// Sessions saved before locations were kept can't tell which photos lack one.
				const unknown = group?.assets.some((a) => a.exifInfo?.latitude === undefined);
				notify(
					n
						? `⌖ ${chosen.label} → ${plural(n, 'photo')} without a location, at commit`
						: unknown
							? 'this session predates location data — start a new one, or tab for just this photo'
							: 'every photo here already has a location — tab for just this photo',
					n === 0
				);
			} else {
				session.setPhotoPlace(asset.id, chosen);
				notify(`${asset.originalFileName} → ${chosen.label}, at commit`);
			}
		}
		onClose();
	}
</script>

{#snippet row({ place, nearby: isNearby }: Option)}
	{#if place}
		<span>{place.label}{#if place.region}<span class="muted"> · {place.region}</span>{/if}</span>
		{#if current && sameSpot(current, place)}
			<span class="check mono">✓</span>
		{:else if isNearby}
			<span class="muted mono">nearby</span>
		{/if}
	{:else}
		<span class="muted">{scope === 'group' ? 'forget this group’s location' : 'leave its location as it is'}</span>
	{/if}
{/snippet}

<PaletteShell
	label="location"
	{scope}
	onScope={(s) => (scope = s)}
	scopes={{ group: 'photos here without one', photo: 'just this photo' }}
	target={asset.originalFileName}
	bind:filter
	placeholder="search a place — e.g. Porto"
	{options}
	key={({ place }) => (place ? `${place.latitude},${place.longitude}` : '\0none')}
	{row}
	status={searching && options.length === 0 ? 'searching…' : undefined}
	empty={filter.trim().length >= 2 ? 'no places found' : 'type a place'}
	enter="set"
	onPick={pick}
	{onClose}
/>
