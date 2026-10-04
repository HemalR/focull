<script lang="ts">
	import { keyLabel, keys, rebindable, type Action } from '$lib/keymap.svelte';

	/**
	 * One of an action's keys (its main one unless `slot` says otherwise). Shift-click records
	 * a new one; it reads "press a key…" meanwhile.
	 */
	let { action, slot = 0 }: { action: Action; slot?: number } = $props();

	const recording = $derived(keys.isRecording(action, slot));
	const key = $derived(keys.of(action)[slot]);
</script>

<kbd class={[recording && 'recording']} {@attach rebindable(action, slot)}>
	{recording ? 'press a key…' : key ? keyLabel(key) : '—'}
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
