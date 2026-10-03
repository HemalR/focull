import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { CullGroup } from '$lib/types';

export const ssr = false;

export async function load({ fetch }) {
	if (!dev) error(404);
	return { groups: (await (await fetch('/api/dev-dump/sample')).json()) as CullGroup[] };
}
