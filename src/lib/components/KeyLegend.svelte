<script lang="ts" module>
	import type { Action } from '$lib/keymap.svelte';

	/** A legend chip: rebindable action key(s), or a fixed key like esc. `run` makes it clickable. */
	export type LegendItem = { label: string; run?: () => void } & ({ action: Action | Action[] } | { keys: string });
</script>

<script lang="ts">
	import { rebindable } from '$lib/keymap.svelte';
	import Key from './Key.svelte';

	let { items, notes = [] }: { items: LegendItem[]; notes?: string[] } = $props();

	/** One action per chip: shift-clicking anywhere on it rebinds that action. */
	const soleAction = (item: LegendItem) => 'action' in item && !Array.isArray(item.action) && item.action;
</script>

{#snippet chipKeys(item: LegendItem)}
	{#if 'keys' in item}
		<kbd>{item.keys}</kbd>
	{:else}
		{#each [item.action].flat() as action (action)}<Key {action} />{/each}
	{/if}
	<span>{item.label}</span>
{/snippet}

<footer class="legend">
	{#each items as item (item.label)}
		{@const action = soleAction(item)}
		{#if item.run}
			<button type="button" class="chip" onclick={item.run} {@attach action && rebindable(action)}>
				{@render chipKeys(item)}
			</button>
		{:else}
			<span class="chip" {@attach action && rebindable(action)}>{@render chipKeys(item)}</span>
		{/if}
	{/each}
	{#each notes as note (note)}
		<span class="note">{note}</span>
	{/each}
</footer>

<style>
	.legend {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding: 8px 14px;
		border-top: 1px solid var(--line);
		background: var(--panel);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--mut);
		border-radius: 4px;
		padding: 2px 4px;
	}

	button.chip:hover {
		color: var(--ink);
	}

	.note {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--mut);
		opacity: 0.7;
		margin-left: auto;
	}

	.note + .note {
		margin-left: 0;
	}
</style>
