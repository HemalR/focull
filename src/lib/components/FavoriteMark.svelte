<script lang="ts">
	import type { AssetResponseDto } from '@immich/sdk';
	import { session } from '$lib/session.svelte';

	/**
	 * ♥ on a photo that is, or will be at commit, an Immich favorite: amber while the change
	 * waits for commit, ♡ for one leaving the favorites. With `onclick` it's a toggle that
	 * always shows (a dim ♡ when off); without, only favorites and pending changes show.
	 * Size and position come from the parent.
	 */
	let { asset, onclick }: { asset: AssetResponseDto; onclick?: () => void } = $props();

	const on = $derived(session.isFavorite(asset));
	const pending = $derived(session.favorites[asset.id] !== undefined);
	const title = $derived(
		`${on ? 'a favorite' : 'not a favorite'}${pending ? ' at commit' : ''}${onclick ? ' · click to change' : ''}`
	);
</script>

{#if onclick}
	<button type="button" class={['fav', pending && 'pending', !on && 'off']} {title} {onclick}>
		{on ? '♥' : '♡'}
	</button>
{:else if on || pending}
	<span class={['fav', pending && 'pending']} {title}>{on ? '♥' : '♡'}</span>
{/if}

<style>
	.fav {
		display: inline-block;
		padding: 0 4px;
		border-radius: 3px;
		background: rgb(0 0 0 / 0.65);
		color: var(--ink);
		line-height: 1.3;
	}

	.pending {
		color: var(--amber);
	}

	.off:not(.pending) {
		color: var(--mut);
	}
</style>
