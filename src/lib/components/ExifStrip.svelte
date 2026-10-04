<script lang="ts">
	import type { AssetResponseDto } from '@immich/sdk';
	import { localDate, localTime } from '$lib/format';
	import { placeLabel } from '$lib/places';
	import { session } from '$lib/session.svelte';

	/**
	 * Where and when a photo was taken: "Porto, Portugal  Jul 14, 2018 · 20:14:37" — or where
	 * it's moving to at commit (⌖, amber). Filename on hover.
	 */
	let { asset }: { asset: AssetResponseDto } = $props();

	const planned = $derived(session.plannedPlace(asset));
	const place = $derived(placeLabel(asset.exifInfo));
</script>

<div class="exif" title={asset.originalFileName}>
	{#if planned}
		<span class="place planned" title="location set at commit">⌖ {planned.label}</span>
	{:else if place}
		<span class="place">{place}</span>
	{/if}
	<span>{localDate(asset.localDateTime)} · {localTime(asset.localDateTime)}</span>
</div>

<style>
	.exif {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 10px;
		border-top: 1px solid var(--line);
		font-family: var(--mono);
		font-size: 11px;
		color: var(--mut);
		white-space: nowrap;
	}

	.place {
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.planned {
		color: var(--amber);
	}
</style>
