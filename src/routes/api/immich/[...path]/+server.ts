import { error, type RequestHandler } from '@sveltejs/kit';
import { apiKeyFrom, immichBase } from '$lib/server/immich';

const REQUEST_HEADERS = ['accept', 'content-type', 'range', 'if-none-match', 'if-modified-since'];
const RESPONSE_HEADERS = [
	'content-type',
	'content-length',
	'content-range',
	'accept-ranges',
	'content-disposition',
	'etag',
	'last-modified',
	'cache-control'
];

/**
 * Same-origin proxy to the Immich API. Auth rides on the focull login cookie and is
 * injected as x-api-key here, which lets plain <img>/<video> tags load media without
 * any client-side auth plumbing (browsers cannot attach headers to media requests).
 */
const proxy: RequestHandler = async ({ params, url, request, cookies }) => {
	const base = immichBase();
	if (!base) error(500, 'IMMICH_URL is not configured');
	const key = apiKeyFrom(cookies);
	if (!key) error(401, 'Not authenticated');

	const headers = new Headers({ 'x-api-key': key });
	for (const name of REQUEST_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}

	const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
	const upstream = await fetch(`${base}/api/${params.path}${url.search}`, {
		method: request.method,
		headers,
		body
	});

	const out = new Headers();
	for (const name of RESPONSE_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) out.set(name, value);
	}
	return new Response(upstream.status === 204 ? null : upstream.body, {
		status: upstream.status,
		headers: out
	});
};

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
