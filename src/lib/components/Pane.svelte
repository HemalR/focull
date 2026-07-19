<script lang="ts">
	import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
	import { playbackUrl, previewUrl } from '$lib/immich';
	import { fmtDuration } from '$lib/format';
	import ExifStrip from './ExifStrip.svelte';

	interface Props {
		asset: AssetResponseDto;
		kind: 'champion' | 'challenger' | 'single';
		/** e.g. "2 of 4" for challengers */
		sub?: string;
		zoomed?: boolean;
		onpick?: () => void;
		title?: string;
	}

	let { asset, kind, sub = '', zoomed = false, onpick, title }: Props = $props();

	const isVideo = $derived(asset.type === AssetTypeEnum.Video);
</script>

{#snippet media()}
	{#key asset.id}
		<span class={['media', kind, zoomed && 'zoomed']}>
			{#if isVideo}
				<video src={playbackUrl(asset.id)} autoplay muted loop playsinline></video>
				<span class="badge">▶ {fmtDuration(asset.duration)}</span>
			{:else}
				<img src={previewUrl(asset.id)} alt={asset.originalFileName} draggable="false" />
			{/if}
		</span>
	{/key}
{/snippet}

<section class={['pane', kind]}>
	<header class="label">
		{#if kind === 'champion'}
			<span class="champ">◆ champion</span>
		{:else if kind === 'challenger'}
			<span>challenger{sub ? ` · ${sub}` : ''}</span>
		{:else}
			<span>single</span>
		{/if}
	</header>
	{#if onpick}
		<button type="button" class="frame" onclick={onpick} {title}>{@render media()}</button>
	{:else}
		<div class="frame">{@render media()}</div>
	{/if}
	<ExifStrip {asset} />
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 6px;
		overflow: hidden;
	}

	.pane.champion {
		border-color: var(--amber-dim);
	}

	.pane.champion:hover {
		border-color: var(--amber);
	}

	header {
		padding: 7px 10px;
		border-bottom: 1px solid var(--line);
	}

	.champ {
		color: var(--amber);
	}

	.frame {
		flex: 1;
		min-height: 0;
		display: block;
		position: relative;
		overflow: hidden;
		background: #000;
		border-radius: 0;
		width: 100%;
	}

	.media {
		position: absolute;
		inset: 0;
		display: block;
	}

	img,
	video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		transition: transform 120ms ease-out;
	}

	.media.zoomed img,
	.media.zoomed video {
		transform: scale(2);
	}

	.badge {
		position: absolute;
		left: 10px;
		bottom: 10px;
		padding: 2px 8px;
		border-radius: 3px;
		background: rgb(0 0 0 / 0.65);
		color: var(--reel);
		font-family: var(--mono);
		font-size: 11px;
	}

	.media.challenger {
		animation: slide-in 160ms ease-out;
	}

	.media.champion {
		animation: pulse 260ms ease-out;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateX(24px);
		}
	}

	@keyframes pulse {
		0% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}
</style>
