import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { Label, Pair } from '../../api/dev-dump/label/+server';

export const ssr = false;

export async function load({ fetch }) {
	if (!dev) error(404);
	const res = await fetch('/api/dev-dump/label');
	return (await res.json()) as { pairs: Pair[]; labels: Record<string, Label> };
}
