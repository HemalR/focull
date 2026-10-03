// TEMPORARY dev-only route: snapshots library metadata to tmp/library.json for grouping analysis.
import { dev } from '$app/environment';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { writeFile } from 'node:fs/promises';
import { apiKeyFrom, immichBase } from '$lib/server/immich';

export const POST: RequestHandler = async ({ cookies }) => {
	if (!dev) error(404);
	const key = apiKeyFrom(cookies);
	if (!key) error(401);
	const call = async (path: string, body?: unknown) => {
		const res = await fetch(`${immichBase()}/api/${path}`, {
			method: body ? 'POST' : 'GET',
			headers: { 'x-api-key': key, 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		});
		if (!res.ok) error(502, `${path}: ${res.status}`);
		return res.json();
	};

	const assets: unknown[] = [];
	for (let page: number | null = 1; page !== null; ) {
		const r = await call('search/metadata', {
			page,
			size: 1000,
			withExif: true,
			withPeople: true,
			withStacked: true,
			visibility: 'timeline',
			order: 'asc'
		});
		assets.push(...r.assets.items);
		page = r.assets.nextPage === null ? null : Number(r.assets.nextPage);
	}

	const tags = (await call('tags')) as { id: string; value: string }[];
	const tagged: Record<string, string[]> = {};
	for (const t of tags.filter((t) => t.value.startsWith('focull/'))) {
		const ids: string[] = [];
		for (let page: number | null = 1; page !== null; ) {
			const r = await call('search/metadata', { page, size: 1000, tagIds: [t.id] });
			ids.push(...r.assets.items.map((a: { id: string }) => a.id));
			page = r.assets.nextPage === null ? null : Number(r.assets.nextPage);
		}
		tagged[t.value] = ids;
	}

	const duplicates = await call('duplicates');
	await writeFile('tmp/library.json', JSON.stringify({ assets, tagged, duplicates }));
	return json({ assets: assets.length, tagged: Object.fromEntries(Object.entries(tagged).map(([k, v]) => [k, v.length])) });
};
