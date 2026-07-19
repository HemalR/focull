import { json, error, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { apiKeyFrom, immichBase, KEY_COOKIE, validateKey } from '$lib/server/immich';

/** Session status: whether a usable key exists (env or cookie) and who it belongs to. */
export const GET: RequestHandler = async ({ cookies }) => {
	const base = immichBase();
	if (!base) return json({ configured: false, authenticated: false });
	const key = apiKeyFrom(cookies);
	const user = key ? await validateKey(base, key) : null;
	return json({
		configured: true,
		authenticated: user !== null,
		envKey: Boolean(env.IMMICH_API_KEY),
		user
	});
};

/** Log in with an Immich API key; validated upstream then stored in an httpOnly cookie. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const base = immichBase();
	if (!base) error(500, 'IMMICH_URL is not configured');
	const { apiKey } = (await request.json()) as { apiKey?: string };
	if (!apiKey?.trim()) error(400, 'API key is required');

	const user = await validateKey(base, apiKey.trim());
	if (!user) error(401, 'Immich rejected that API key');

	cookies.set(KEY_COOKIE, apiKey.trim(), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 24 * 90
	});
	return json({ user });
};

export const DELETE: RequestHandler = ({ cookies }) => {
	cookies.delete(KEY_COOKIE, { path: '/' });
	return json({ ok: true });
};
