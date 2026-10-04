<script lang="ts">
	import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
	import { fullsizeUrl, playbackUrl, previewUrl } from '$lib/immich';
	import { fmtDuration } from '$lib/format';
	import { thumbhashStyle } from '$lib/thumbhash';
	import ExifStrip from './ExifStrip.svelte';

	interface Props {
		asset: AssetResponseDto;
		kind: 'champion' | 'challenger' | 'single';
		/** e.g. "2 of 4" for challengers */
		sub?: string;
		/** Albums this asset goes to at commit — shows a "◇ N" badge when > 0. */
		albumCount?: number;
		zoomed?: boolean;
		/** Held up to your face: the pane takes the whole viewport (Battle: while ↑ is down). */
		lifted?: boolean;
		/** Shared pan point (0..1) while zoomed — both panes follow the same cursor. */
		pan?: { x: number; y: number };
		onpan?: (pan: { x: number; y: number }) => void;
		/** Show the 2× magnifier under the cursor (Battle turns it on while Shift is held). */
		loupe?: boolean;
		muted?: boolean;
		ontogglemute?: () => void;
		onpick?: () => void;
		title?: string;
	}

	let {
		asset,
		kind,
		sub = '',
		albumCount = 0,
		zoomed = false,
		lifted = false,
		pan = { x: 0.5, y: 0.5 },
		onpan,
		loupe = false,
		muted = true,
		ontogglemute,
		onpick,
		title
	}: Props = $props();

	const isVideo = $derived(asset.type === AssetTypeEnum.Video);

	let fullLoaded = $state(false);
	$effect(() => {
		void asset.id;
		void zoomed;
		fullLoaded = false;
	});

	// Local cursor for the loupe (per-pane, unlike the shared zoom pan).
	let cursor = $state<{ x: number; y: number; fw: number; fh: number } | null>(null);

	function onmove(event: PointerEvent) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		cursor = { x, y, fw: rect.width, fh: rect.height };
		if (zoomed) {
			onpan?.({
				x: Math.min(Math.max(x / rect.width, 0), 1),
				y: Math.min(Math.max(y / rect.height, 0), 1)
			});
		}
	}

	const LOUPE = 200;
	const loupeStyle = $derived.by(() => {
		if (!loupe || zoomed || isVideo || !cursor || !asset.width || !asset.height) return null;
		const { x, y, fw, fh } = cursor;
		const scale = Math.min(fw / asset.width, fh / asset.height);
		const dw = asset.width * scale;
		const dh = asset.height * scale;
		const ix = x - (fw - dw) / 2;
		const iy = y - (fh - dh) / 2;
		if (ix < 0 || iy < 0 || ix > dw || iy > dh) return null;
		return (
			`left:${x - LOUPE / 2}px;top:${y - LOUPE / 2}px;` +
			`background-image:url(${previewUrl(asset.id)});` +
			`background-size:${dw * 2}px ${dh * 2}px;` +
			`background-position:${-(ix * 2 - LOUPE / 2)}px ${-(iy * 2 - LOUPE / 2)}px;`
		);
	});
</script>

{#snippet media()}
	{#key asset.id}
		<span class={['media', kind]} style:--px="{pan.x * 100}%" style:--py="{pan.y * 100}%">
			{#if isVideo}
				<video
					class={[zoomed && 'zoomed']}
					src={playbackUrl(asset.id)}
					autoplay
					{muted}
					loop
					playsinline
				></video>
				<span class="badge">▶ {fmtDuration(asset.duration)}</span>
			{:else if zoomed}
				<img
					class="full"
					src={fullsizeUrl(asset.id)}
					alt={asset.originalFileName}
					draggable="false"
					style={thumbhashStyle(asset, 'contain')}
					onload={() => (fullLoaded = true)}
				/>
				{#if !fullLoaded}
					<span class="shimmer mono">loading full res</span>
				{/if}
			{:else}
				<img
					src={previewUrl(asset.id)}
					alt={asset.originalFileName}
					draggable="false"
					style={thumbhashStyle(asset, 'contain')}
				/>
			{/if}
		</span>
	{/key}
	{#if loupeStyle}
		<span class="loupe" style={loupeStyle}></span>
	{/if}
{/snippet}

<section class={['pane', kind, lifted && 'lifted']}>
	<header class="label">
		{#if kind === 'champion'}
			<span class="champ">◆ champion</span>
		{:else if kind === 'challenger'}
			<span>challenger{sub ? ` · ${sub}` : ''}</span>
		{:else}
			<span>single</span>
		{/if}
		{#if albumCount > 0}
			<span class="staged" title="goes to {albumCount} album{albumCount === 1 ? '' : 's'} at commit">
				◇ {albumCount}
			</span>
		{/if}
	</header>
	<div class="frame-wrap">
		{#if onpick}
			<button
				type="button"
				class="frame"
				onclick={onpick}
				{title}
				onpointermove={onmove}
				onpointerleave={() => (cursor = null)}
			>
				{@render media()}
			</button>
		{:else}
			<!-- pointer handlers are a mouse-only enhancement (loupe/pan); keyboard has Z -->
			<div
				class="frame"
				role="presentation"
				onpointermove={onmove}
				onpointerleave={() => (cursor = null)}
			>
				{@render media()}
			</div>
		{/if}
		{#if isVideo && ontogglemute}
			<button type="button" class="mute mono" onclick={ontogglemute} title="toggle sound (M)">
				{muted ? '♪ unmute' : '♪ mute'}
			</button>
		{/if}
	</div>
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

	/* Above the battle chrome, below overlays and toasts. */
	.pane.lifted {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: none;
		border-radius: 0;
	}

	.pane.champion:hover {
		border-color: var(--amber);
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 7px 10px;
		border-bottom: 1px solid var(--line);
	}

	.champ {
		color: var(--amber);
	}

	.staged {
		color: var(--mut);
	}

	.frame-wrap {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
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
	}

	img.full,
	video.zoomed {
		transform: scale(2.5);
		transform-origin: var(--px) var(--py);
	}

	.shimmer {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 11px;
		color: var(--mut);
		background: linear-gradient(100deg, var(--panel2) 40%, var(--line) 50%, var(--panel2) 60%);
		background-size: 300% 100%;
		animation: shimmer 1.1s linear infinite;
		pointer-events: none;
	}

	@keyframes shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: -100% 0;
		}
	}

	.loupe {
		position: absolute;
		width: 200px;
		height: 200px;
		border-radius: 50%;
		border: 1px solid var(--amber-dim);
		box-shadow: 0 4px 20px rgb(0 0 0 / 0.6);
		background-color: #000;
		pointer-events: none;
		z-index: 5;
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

	.mute {
		position: absolute;
		right: 10px;
		bottom: 10px;
		z-index: 6;
		padding: 3px 9px;
		border-radius: 3px;
		font-size: 11px;
		color: var(--ink);
		background: rgb(0 0 0 / 0.65);
		border: 1px solid var(--line);
	}

	.mute:hover {
		border-color: var(--mut);
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
