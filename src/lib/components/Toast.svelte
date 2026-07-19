<script lang="ts" module>
	export interface ToastData {
		msg: string;
		err?: boolean;
	}
</script>

<script lang="ts">
	let { toast }: { toast: ToastData | null } = $props();
</script>

<div role="status" aria-live="polite">
	{#if toast}
		<div class={['toast', toast.err && 'err']}>{toast.msg}</div>
	{/if}
</div>

<style>
	.toast {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 50;
		max-width: 340px;
		padding: 8px 12px;
		font-family: var(--mono);
		font-size: 12px;
		color: var(--ink);
		background: var(--panel2);
		border: 1px solid var(--line);
		border-radius: 5px;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.4);
		animation: toast-in 160ms ease-out;
	}

	.toast.err {
		border-color: var(--rej);
		color: var(--rej);
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
</style>
