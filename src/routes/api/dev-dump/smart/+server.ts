// TEMPORARY dev-only route: CLIP neighbour ranks via Immich smart search for a sample of photos.
import { dev } from '$app/environment';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { readFile, writeFile } from 'node:fs/promises';
import { apiKeyFrom, immichBase } from '$lib/server/immich';

type A = { id: string; type: string; fileCreatedAt: string; exifInfo?: { dateTimeOriginal?: string } };

export const POST: RequestHandler = async ({ cookies, url }) => {
	if (!dev) error(404);
	const key = apiKeyFrom(cookies);
	if (!key) error(401);
	const n = Number(url.searchParams.get('n') ?? 300);
	const windowMin = Number(url.searchParams.get('window') ?? 15);
	const { assets } = JSON.parse(await readFile('tmp/library.json', 'utf8')) as { assets: A[] };
	const t = (a: A) => new Date(a.exifInfo?.dateTimeOriginal ?? a.fileCreatedAt).getTime();
	const photos = assets.filter((a) => a.type === 'IMAGE');
	let seed = 11;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const sample = Array.from({ length: n }, () => photos[Math.floor(rnd() * photos.length)]);

	const out: Record<string, string[]> = {};
	const times: number[] = [];
	let next = 0;
	const worker = async () => {
		while (next < sample.length) {
			const a = sample[next++];
			const start = Date.now();
			const res = await fetch(`${immichBase()}/api/search/smart`, {
				method: 'POST',
				headers: { 'x-api-key': key, 'content-type': 'application/json' },
				body: JSON.stringify({
					queryAssetId: a.id,
					takenAfter: new Date(t(a) - windowMin * 60_000).toISOString(),
					takenBefore: new Date(t(a) + windowMin * 60_000).toISOString(),
					type: 'IMAGE',
					size: 20
				})
			});
			times.push(Date.now() - start);
			if (res.ok) out[a.id] = ((await res.json()).assets.items as { id: string }[]).map((x) => x.id);
		}
	};
	await Promise.all(Array.from({ length: 6 }, worker));
	await writeFile('tmp/smart.json', JSON.stringify(out));
	times.sort((a, b) => a - b);
	return json({ queried: Object.keys(out).length, p50: times[times.length >> 1], p90: times[Math.floor(times.length * 0.9)] });
};
