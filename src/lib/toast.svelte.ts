import type { ToastData } from './components/Toast.svelte';

/** The one toast on screen. Anything can raise it; the page renders `toast.current`. */
export const toast = $state<{ current: ToastData | null }>({ current: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function notify(msg: string, err = false, ms = 1600): void {
	toast.current = { msg, err };
	clearTimeout(timer);
	timer = setTimeout(() => (toast.current = null), ms);
}

export function clearToast(): void {
	clearTimeout(timer);
	toast.current = null;
}
