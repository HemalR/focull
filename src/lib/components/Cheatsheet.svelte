<script lang="ts">
	import { createHotkey } from '@tanstack/svelte-hotkeys';
	import { ACTIONS, CHEATSHEET, keyLabel, keys, MAX_KEYS } from '$lib/keymap.svelte';
	import Key from './Key.svelte';

	/** Every gesture and key, grouped by screen — and the place to rebind keys: click one, press the new key. */
	let { onClose }: { onClose: () => void } = $props();

	createHotkey('Escape', () => onClose(), { conflictBehavior: 'allow' });
</script>

<div class="overlay">
	<button type="button" class="backdrop" aria-label="close cheatsheet" onclick={onClose}></button>
	<div class="card sheet" role="dialog" aria-modal="true" aria-label="keyboard shortcuts">
		<header>
			<span class="label">gestures & shortcuts</span>
			<span class="muted mono">
				{#if keys.anyCustom}
					<button type="button" class="reset" onclick={keys.resetAll}>reset all keys</button> ·
				{/if}
				? or esc closes
			</span>
		</header>
		<div class="groups">
			{#each CHEATSHEET as section (section.title)}
				<section>
					<h2 class="label">{section.title}</h2>
					<dl>
						{#each section.actions as action (action)}
							{@const { hold, label, keys: defaults } = ACTIONS[action]}
							{@const bound = keys.of(action)}
							<dt>
								{#if hold}<span class="hold mono">hold</span>{/if}
								{#each bound as key, slot (key)}
									<button type="button" class="rebind" title="click to change" onclick={() => keys.record(action, slot)}>
										<Key {action} {slot} />
									</button>
									{#if bound.length > 1}
										<button type="button" class="drop" title="remove this key" onclick={() => keys.removeKey(action, slot)}>
											×
										</button>
									{/if}
								{/each}
								{#if bound.length < MAX_KEYS}
									<button
										type="button"
										class={['add', 'mono', keys.isRecording(action, bound.length) && 'recording']}
										title="add another key"
										onclick={() => keys.record(action, bound.length)}
									>
										{keys.isRecording(action, bound.length) ? 'press a key…' : '+'}
									</button>
								{/if}
							</dt>
							<dd class="mono">
								{label}
								{#if keys.isCustom(action)}
									<button type="button" class="reset" title="back to the default" onclick={() => keys.reset(action)}>
										↺ {defaults.map(keyLabel).join(' / ')}
									</button>
								{/if}
							</dd>
						{/each}
						{#each section.fixed as row (row.keys + row.label)}
							<dt><kbd>{row.keys}</kbd></dt>
							<dd class="mono">{row.label}</dd>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
		<p class="muted mono foot">
			click a key to change it (or shift-click one anywhere on screen) · hover for + another key, × remove one · a
			key that's already taken swaps over.
		</p>
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

	.rebind {
		padding: 0;
		border-radius: 3px;
	}

	.rebind:hover :global(kbd) {
		border-color: var(--amber-dim);
	}

	/* Shown on hover (or focus) so the sheet stays readable. */
	.drop,
	.add {
		padding: 0 3px;
		font-size: 11px;
		color: var(--mut);
		opacity: 0;
	}

	dt:hover :is(.drop, .add),
	:is(.drop, .add):focus-visible,
	.add.recording {
		opacity: 1;
	}

	.drop:hover,
	.add:hover,
	.add.recording {
		color: var(--amber);
	}

	.hold {
		margin-right: 6px;
		font-size: 11px;
		color: var(--mut);
	}

	.reset {
		margin-left: 6px;
		color: var(--amber);
		font-size: 11px;
	}

	.reset:hover {
		text-decoration: underline;
	}

	.foot {
		margin: 18px 0 0;
		font-size: 11px;
	}

	/* Touch screens hide key caps app-wide; here they label the gestures, so keep them. */
	@media (hover: none) and (pointer: coarse) {
		.sheet :global(kbd) {
			display: inline-block;
		}
	}
</style>
