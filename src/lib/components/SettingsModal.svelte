<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { session } from '$lib/session.svelte';

	let { stitchAvailable, onClose }: { stitchAvailable: boolean; onClose: () => void } = $props();

	const save = () =>
		localStorage.setItem('focull.settings', JSON.stringify($state.snapshot(session.settings)));

	createHotkey('Escape', () => onClose(), { conflictBehavior: 'allow' });
</script>

<div class="overlay">
	<button type="button" class="backdrop" aria-label="close settings" onclick={onClose}></button>
	<div class="card modal" role="dialog" aria-modal="true" aria-label="settings">
		<header>
			<span class="label">settings</span>
			<button type="button" class="close mono" onclick={onClose} title="close (esc)">✕</button>
		</header>

		<label class="row">
			<span class="label">on commit, culled assets are</span>
			<select bind:value={session.settings.rejectAction} onchange={save}>
				<option value="tag">tagged (default — nothing deleted)</option>
				<option value="archive">archived</option>
				<option value="trash">trashed</option>
			</select>
		</label>
		{#if session.settings.rejectAction === 'trash'}
			<p class="warn mono">trash really moves culled assets to the Immich trash on commit.</p>
		{/if}

		<div class="pair">
			<label class="row">
				<span class="label">culled tag</span>
				<input type="text" bind:value={session.settings.tagName} onchange={save} />
			</label>
			<label class="row">
				<span class="label">reviewed tag</span>
				<input type="text" bind:value={session.settings.reviewedTagName} onchange={save} />
			</label>
		</div>
		<p class="muted mono note">
			culled marks the losers; reviewed marks everything a session judged, so future sessions skip it.
		</p>

		<label class="row">
			<span class="label">photo burst window (seconds)</span>
			<input type="number" min="1" bind:value={session.settings.photoWindowSeconds} onchange={save} />
		</label>

		<label class="row">
			<span class="label">video event window (seconds)</span>
			<input type="number" min="1" bind:value={session.settings.videoWindowSeconds} onchange={save} />
		</label>

		{#if !stitchAvailable}
			<p class="muted mono note">video stitching is off — ffmpeg was not found on the server.</p>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgb(0 0 0 / 0.55);
		cursor: default;
	}

	.modal {
		position: relative;
		width: min(420px, 92vw);
		padding: 20px 22px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.close {
		color: var(--mut);
		padding: 2px 6px;
	}

	.close:hover {
		color: var(--ink);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.pair input {
		min-width: 0;
	}

	.warn {
		color: var(--rej);
		margin: -6px 0 0;
		font-size: 11px;
	}

	.note {
		margin: 0;
		font-size: 11px;
	}
</style>
