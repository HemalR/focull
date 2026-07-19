<script lang="ts" module>
	export interface LegendItem {
		key: string;
		label: string;
		action?: () => void;
	}
</script>

<script lang="ts">
	let { items, notes = [] }: { items: LegendItem[]; notes?: string[] } = $props();
</script>

<footer class="legend">
	{#each items as item (item.key)}
		{#if item.action}
			<button type="button" class="chip" onclick={item.action}>
				<kbd>{item.key}</kbd><span>{item.label}</span>
			</button>
		{:else}
			<span class="chip"><kbd>{item.key}</kbd><span>{item.label}</span></span>
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
