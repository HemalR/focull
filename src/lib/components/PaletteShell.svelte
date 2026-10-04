<script lang="ts" generics="T">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import type { Snippet } from 'svelte';
	import type { PaletteScope } from '$lib/types';

	/**
	 * The overlay the album and location palettes share: a scope switch (Tab), a filter box,
	 * and a keyboard-driven list (↑ ↓ ↵; Esc closes). Rows are the parent's `row` snippet.
	 */
	interface Props {
		label: string;
		scope: PaletteScope;
		onScope: (scope: PaletteScope) => void;
		scopes: Record<PaletteScope, string>;
		/** Which photo the 'photo' scope works on. */
		target: string;
		filter: string;
		placeholder: string;
		options: T[];
		key: (option: T) => string;
		row: Snippet<[T]>;
		/** Shown in place of the list (e.g. while loading). */
		status?: string;
		empty: string;
		/** What ↵ does, for the help line. */
		enter: string;
		onPick: (option: T) => void;
		onClose: () => void;
	}

	let {
		label,
		scope,
		onScope,
		scopes,
		target,
		filter = $bindable(),
		placeholder,
		options,
		key,
		row,
		status,
		empty,
		enter,
		onPick,
		onClose
	}: Props = $props();

	let highlight = $state(0);
	const hl = $derived(Math.min(highlight, Math.max(options.length - 1, 0)));
	const other = $derived(scope === 'group' ? 'photo' : 'group');

	const opts = { conflictBehavior: 'allow', ignoreInputs: false } as const;
	createHotkey('Escape', () => onClose(), opts);
	createHotkey('Enter', () => options[hl] !== undefined && onPick(options[hl]), opts);
	createHotkey('ArrowDown', () => (highlight = Math.min(hl + 1, options.length - 1)), opts);
	createHotkey('ArrowUp', () => (highlight = Math.max(hl - 1, 0)), opts);
	createHotkey('Tab', () => onScope(other), opts);
</script>

<div class="overlay">
	<button type="button" class="backdrop" aria-label="close {label}" onclick={onClose}></button>
	<div class="card palette" role="dialog" aria-modal="true" aria-label={label}>
		<header>
			<span class="scopes mono">
				{#each ['group', 'photo'] as const as s (s)}
					<button type="button" class={[scope === s && 'on']} onclick={() => onScope(s)}>{scopes[s]}</button>
				{/each}
			</span>
			{#if scope === 'photo'}
				<span class="muted mono target" title={target}>{target}</span>
			{/if}
		</header>
		<!-- svelte-ignore a11y_autofocus -->
		<input type="text" {placeholder} autofocus bind:value={filter} oninput={() => (highlight = 0)} />
		{#if status}
			<p class="muted mono">{status}</p>
		{:else}
			<ul>
				{#each options as option, i (key(option))}
					<li>
						<button
							type="button"
							class={['row', i === hl && 'hl']}
							onclick={() => onPick(option)}
							{@attach (el) => {
								if (i === hl) el.scrollIntoView({ block: 'nearest' });
							}}
						>
							{@render row(option)}
						</button>
					</li>
				{:else}
					<li class="muted mono empty">{empty}</li>
				{/each}
			</ul>
		{/if}
		<p class="muted mono help">↑↓ move · ↵ {enter} · tab {scopes[other]} · esc close</p>
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

	/* Phones: sit high so the on-screen keyboard doesn't cover the list. */
	@media (pointer: coarse), (max-width: 760px) {
		.overlay {
			place-items: start center;
			padding-top: calc(10dvh + env(safe-area-inset-top));
		}

		.row {
			padding: 12px 10px;
		}

		.help {
			display: none;
		}
	}

	.palette {
		position: relative;
		width: min(440px, 92vw);
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}

	.target {
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	/* Row contents are the parent's snippet. */
	.row :global(.accent) {
		color: var(--amber);
	}

	.row :global(.check) {
		color: var(--keep);
	}

	.empty {
		padding: 8px 10px;
	}

	.help {
		margin: 0;
		font-size: 11px;
	}

	p {
		margin: 0;
	}

	.scopes {
		display: inline-flex;
		gap: 4px;
		font-size: 11px;
	}

	.scopes button {
		padding: 3px 8px;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--mut);
	}

	.scopes button:hover {
		color: var(--ink);
	}

	.scopes .on {
		color: var(--amber);
		border-color: var(--amber-dim);
	}
</style>
