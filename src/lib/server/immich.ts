import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export const KEY_COOKIE = 'focull_key';

export const immichBase = (): string => (env.IMMICH_URL ?? '').replace(/\/+$/, '');

/** API key resolution: IMMICH_API_KEY env (zero-login single-user setups) wins, else the login cookie. */
export const apiKeyFrom = (cookies: Cookies): string | null =>
	env.IMMICH_API_KEY || cookies.get(KEY_COOKIE) || null;

export async function validateKey(base: string, apiKey: string): Promise<{ name: string; email: string } | null> {
	try {
		const res = await fetch(`${base}/api/users/me`, { headers: { 'x-api-key': apiKey } });
		if (!res.ok) return null;
		const user = (await res.json()) as { name: string; email: string };
		return { name: user.name, email: user.email };
	} catch {
		return null;
	}
}
