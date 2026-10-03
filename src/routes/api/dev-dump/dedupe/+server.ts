// TEMPORARY dev-only route: resolve high-confidence duplicate copies (same name, same time or whole-hour
// shift). Keeps Immich's suggested copy, merges tags + album membership onto it, trashes the other.
// ?apply=1 executes; otherwise writes a dry-run plan to tmp/dedupe-plan.json.
import { dev } from '$app/environment';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { apiKeyFrom, immichBase } from '$lib/server/immich';

type Asset = {
	id: string;
	originalFileName: string;
	fileCreatedAt: string;
	exifInfo?: { dateTimeOriginal?: string };
	tags?: { id: string; value: string }[];
};
type Dup = { duplicateId: string; assets: Asset[]; suggestedKeepAssetIds: string[] };

export const POST: RequestHandler = async ({ cookies, url }) => {
	if (!dev) error(404);
	const key = apiKeyFrom(cookies);
	if (!key) error(401);
	const apply = url.searchParams.get('apply') === '1';
	const call = async (method: string, path: string, body?: unknown) => {
		const res = await fetch(`${immichBase()}/api/${path}`, {
			method,
			headers: { 'x-api-key': key, 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		});
		if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
		return res.status === 204 ? null : res.json();
	};
	const log = (line: string) => appendFile('tmp/dedupe.log', `${new Date().toISOString()} ${line}\n`);

	// Fresh duplicate list, not the snapshot — the library may have changed.
	const dups = (await call('GET', 'duplicates')) as Dup[];
	const t = (a: Asset) => new Date(a.exifInfo?.dateTimeOriginal ?? a.fileCreatedAt).getTime();
	const base = (a: Asset) => a.originalFileName.replace(/\.[^.]+$/, '').toLowerCase();
	const groups = dups.filter((d) => {
		if (d.assets.length !== 2 || base(d.assets[0]) !== base(d.assets[1])) return false;
		const h = Math.abs(t(d.assets[1]) - t(d.assets[0])) / 3.6e6;
		return Math.abs(h - Math.round(h)) < 0.001 && d.suggestedKeepAssetIds.length === 1;
	});

	// Album membership of every asset that will be trashed.
	const albums = (await call('GET', 'albums')) as { id: string; albumName: string }[];
	const albumsOf = new Map<string, string[]>();
	for (const album of albums) {
		for (let page: number | null = 1; page !== null; ) {
			const r = (await call('POST', 'search/metadata', { albumIds: [album.id], page, size: 1000 })) as {
				assets: { items: { id: string }[]; nextPage: string | null };
			};
			for (const a of r.assets.items) albumsOf.set(a.id, [...(albumsOf.get(a.id) ?? []), album.id]);
			page = r.assets.nextPage === null ? null : Number(r.assets.nextPage);
		}
	}

	const plan = groups.map((d) => {
		const keep = d.assets.find((a) => a.id === d.suggestedKeepAssetIds[0])!;
		const trash = d.assets.find((a) => a !== keep)!;
		const keepTags = new Set((keep.tags ?? []).map((x) => x.id));
		const keepAlbums = new Set(albumsOf.get(keep.id) ?? []);
		return {
			duplicateId: d.duplicateId,
			keep: keep.id,
			trash: trash.id,
			// Provenance tag stays with the copy it describes.
			addTags: (trash.tags ?? []).filter((x) => !keepTags.has(x.id) && x.value !== 'Google Photos'),
			addAlbums: (albumsOf.get(trash.id) ?? []).filter((id) => !keepAlbums.has(id))
		};
	});
	const summary = {
		groups: plan.length,
		trash: plan.length,
		keepersGainingTags: plan.filter((p) => p.addTags.length).length,
		keepersGainingAlbums: plan.filter((p) => p.addAlbums.length).length,
		albumsScanned: albums.length
	};
	await writeFile('tmp/dedupe-plan.json', JSON.stringify({ summary, plan }, null, 1));
	if (!apply) return json({ dryRun: true, ...summary });

	await log(`apply start ${JSON.stringify(summary)}`);
	const byTag = new Map<string, string[]>();
	for (const p of plan) for (const tag of p.addTags) byTag.set(tag.id, [...(byTag.get(tag.id) ?? []), p.keep]);
	for (const [tagId, assetIds] of byTag) {
		await call('PUT', 'tags/assets', { tagIds: [tagId], assetIds });
	}
	await log(`tags merged: ${byTag.size} tags`);
	const byAlbum = new Map<string, string[]>();
	for (const p of plan) for (const id of p.addAlbums) byAlbum.set(id, [...(byAlbum.get(id) ?? []), p.keep]);
	for (const [albumId, ids] of byAlbum) await call('PUT', `albums/${albumId}/assets`, { ids });
	await log(`albums merged: ${byAlbum.size} albums`);

	await writeFile('tmp/dedupe-trashed.json', JSON.stringify(plan.map((p) => p.trash)));
	let done = 0;
	for (let i = 0; i < plan.length; i += 100) {
		const batch = plan.slice(i, i + 100);
		const results = (await call('POST', 'duplicates/resolve', {
			groups: batch.map((p) => ({ duplicateId: p.duplicateId, keepAssetIds: [p.keep], trashAssetIds: [p.trash] }))
		})) as { id: string; success: boolean; error?: string }[];
		const failed = results.filter((r) => !r.success);
		if (failed.length) await log(`batch failures: ${JSON.stringify(failed)}`);
		done += batch.length;
		await log(`resolved ${done}/${plan.length}`);
	}
	return json({ applied: true, ...summary });
};
