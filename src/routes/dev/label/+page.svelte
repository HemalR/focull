<script lang="ts">
	// TEMPORARY dev-only page: hand-label neighbour pairs as ground truth for grouping tuning.
	import { untrack } from 'svelte';
	import { previewUrl } from '$lib/immich';
	import type { Label } from '../../api/dev-dump/label/+server';

	let { data } = $props();

	const keyOf = (i: number) => `${data.pairs[i].a}|${data.pairs[i].b}`;
	// Seeded once from the loader; local state is the source of truth afterwards.
	let labels = $state<Record<string, Label>>(untrack(() => ({ ...data.labels })));
	let i = $state(untrack(() => Math.max(0, data.pairs.findIndex((_, k) => !(keyOf(k) in data.labels)))));

	const pair = $derived(data.pairs[i]);
	const done = $derived(Object.keys(labels).length);
	const finished = $derived(done >= data.pairs.length);

	// Warm the next pair so labelling never waits on the network.
	$effect(() => {
		const next = data.pairs[i + 1];
		if (next) for (const id of [next.a, next.b]) new Image().src = previewUrl(id);
	});

	async function mark(label: Label) {
		if (!pair) return;
		const key = keyOf(i);
		labels[key] = label;
		await fetch('/api/dev-dump/label', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ key, label })
		});
		const nextOpen = data.pairs.findIndex((_, k) => k > i && !(keyOf(k) in labels));
		i = nextOpen === -1 ? Math.min(i + 1, data.pairs.length - 1) : nextOpen;
	}

	function onkeydown(e: KeyboardEvent) {
		const map: Record<string, () => void> = {
			s: () => void mark('same'),
			d: () => void mark('different'),
			u: () => void mark('unsure'),
			ArrowLeft: () => (i = Math.max(0, i - 1)),
			ArrowRight: () => (i = Math.min(data.pairs.length - 1, i + 1))
		};
		map[e.key]?.();
	}
</script>

<svelte:window {onkeydown} />

<div class="label-page">
	<header class="mono">
		<span class="brand">focull<span class="dot">.</span> labels</span>
		<span class="muted">{done}/{data.pairs.length} labelled · pair {i + 1}</span>
	</header>

	{#if pair}
		<p class="question">Same moment? Would you want these in one group to pick the best (or keep both)?</p>
		<div class="pair">
			{#key pair.a}
				<img src={previewUrl(pair.a)} alt="first" />
			{/key}
			{#key pair.b}
				<img src={previewUrl(pair.b)} alt="second" />
			{/key}
		</div>
		<p class="mono muted status">
			{#if labels[keyOf(i)]}currently: {labels[keyOf(i)]}{:else}&nbsp;{/if}
			{#if finished} · all done, thank you!{/if}
		</p>
		<nav>
			<button type="button" class="same" onclick={() => void mark('same')}>Same <kbd>S</kbd></button>
			<button type="button" class="unsure" onclick={() => void mark('unsure')}>Not sure <kbd>U</kbd></button>
			<button type="button" class="diff" onclick={() => void mark('different')}>Different <kbd>D</kbd></button>
		</nav>
		<nav class="step mono">
			<button type="button" onclick={() => (i = Math.max(0, i - 1))}>← back</button>
			<button type="button" onclick={() => (i = Math.min(data.pairs.length - 1, i + 1))}>next →</button>
		</nav>
	{/if}
</div>

<style>
	.label-page {
		height: 100dvh;
		display: grid;
		grid-template-rows: auto auto 1fr auto auto auto;
		gap: 8px;
		padding: 10px;
	}

	header {
		display: flex;
		justify-content: space-between;
	}

	.question {
		margin: 0;
		text-align: center;
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		min-height: 0;
	}

	/* Narrow screens: stack the pair so each photo gets the full width. */
	@media (max-aspect-ratio: 1/1) {
		.pair {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 1fr;
		}
	}

	img {
		width: 100%;
		height: 100%;
		min-height: 0;
		object-fit: contain;
		background: #000;
		border-radius: 4px;
	}

	.status {
		margin: 0;
		text-align: center;
	}

	nav {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
	}

	nav button {
		padding: 14px 8px;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: var(--panel2);
		font-size: 15px;
	}

	.same {
		color: var(--keep);
		border-color: var(--keep);
	}

	.diff {
		color: var(--rej);
		border-color: var(--rej);
	}

	.unsure {
		color: var(--mut);
	}

	.step {
		grid-template-columns: 1fr 1fr;
	}

	.step button {
		padding: 6px;
		font-size: 12px;
		color: var(--mut);
		border: none;
		background: none;
	}
</style>
