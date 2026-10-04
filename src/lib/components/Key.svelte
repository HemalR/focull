<script lang="ts">
	import { keyLabel, keys, rebindable, type Action } from '$lib/keymap.svelte';

	/** An action's current key. Shift-click records a new one; it reads "press a key…" meanwhile. */
	let { action }: { action: Action } = $props();

	const recording = $derived(keys.recording === action);
</script>

<kbd class={[recording && 'recording']} {@attach rebindable(action)}>
	{recording ? 'press a key…' : keyLabel(keys.of(action))}
</kbd>

<style>
	.recording {
		color: var(--amber);
		border-color: var(--amber);
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}
</style>
