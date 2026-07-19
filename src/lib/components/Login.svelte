<script lang="ts">
	import { login, type AuthUser } from '$lib/api';

	let { onSuccess }: { onSuccess: (user: AuthUser) => void } = $props();

	let apiKey = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!apiKey.trim() || busy) return;
		busy = true;
		error = '';
		try {
			onSuccess(await login(apiKey.trim()));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Login failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="center-screen">
	<form class="card" onsubmit={submit}>
		<span class="brand">focull<span class="dot">.</span></span>
		<label class="label" for="api-key">immich api key</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="api-key"
			type="password"
			bind:value={apiKey}
			autofocus
			autocomplete="off"
			placeholder="paste your API key"
		/>
		{#if error}<p class="error mono">{error}</p>{/if}
		<button type="submit" class="btn" disabled={busy}>
			{busy ? 'checking…' : 'log in'}
		</button>
		<p class="help muted mono">Immich → Account Settings → API Keys → New API Key</p>
	</form>
</div>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(360px, 90vw);
		padding: 28px;
	}

	.brand {
		font-size: 18px;
		margin-bottom: 8px;
	}

	.error {
		color: var(--rej);
		margin: 0;
	}

	.help {
		margin: 4px 0 0;
		font-size: 11px;
	}

	button[disabled] {
		opacity: 0.6;
		cursor: default;
	}
</style>
