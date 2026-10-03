<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { KEYMAP } from '$lib/keymap';

	let { onClose }: { onClose: () => void } = $props();

	createHotkey('Escape', () => onClose(), { conflictBehavior: 'allow' });
</script>

<div class="overlay">
	<button type="button" class="backdrop" aria-label="close cheatsheet" onclick={onClose}></button>
	<div class="card sheet" role="dialog" aria-modal="true" aria-label="keyboard shortcuts">
		<header>
			<span class="label">gestures & shortcuts</span>
			<span class="muted mono">? or esc closes</span>
		</header>
		<div class="groups">
			{#each KEYMAP as group (group.title)}
				<section>
					<h2 class="label">{group.title}</h2>
					<dl>
						{#each group.entries as entry (entry.keys + entry.label)}
							<dt><kbd>{entry.keys}</kbd></dt>
							<dd class="mono">{entry.label}</dd>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 45;
		display: grid;
		place-items: center;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgb(0 0 0 / 0.6);
		cursor: default;
	}

	.sheet {
		position: relative;
		width: min(720px, 94vw);
		max-height: 86dvh;
		overflow-y: auto;
		padding: 22px 26px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 16px;
	}

	.groups {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px 28px;
	}

	section:first-child {
		grid-row: span 2;
	}

	@media (max-width: 760px) {
		.groups {
			grid-template-columns: 1fr;
		}

		section:first-child {
			grid-row: auto;
		}
	}

	h2 {
		margin: 0 0 8px;
		color: var(--amber);
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 12px;
		align-items: baseline;
	}

	dt {
		text-align: right;
	}

	dd {
		margin: 0;
		font-size: 12px;
		color: var(--mut);
	}
</style>
