<script lang="ts">
	import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
	import { fmtDuration, localTime } from '$lib/format';

	let { asset }: { asset: AssetResponseDto } = $props();

	const camera = $derived.by(() => {
		const exif = asset.exifInfo;
		if (!exif) return '';
		const parts: string[] = [];
		if (exif.fNumber) parts.push(`ƒ/${exif.fNumber}`);
		if (exif.exposureTime) parts.push(`${exif.exposureTime}s`);
		if (exif.iso) parts.push(`ISO ${exif.iso}`);
		return parts.join(' ');
	});
</script>

<div class="exif">
	<span class="name" title={asset.originalFileName}>{asset.originalFileName}</span>
	<span>{localTime(asset.localDateTime)}</span>
	{#if asset.type === AssetTypeEnum.Video}
		<span class="dur">▶ {fmtDuration(asset.duration)}</span>
	{:else if camera}
		<span>{camera}</span>
	{/if}
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

	.name {
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.dur {
		color: var(--reel);
	}
</style>
