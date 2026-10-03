// TEMPORARY dev-only route: neighbour-pair sample for hand labelling (GET) and label storage (POST).
import { dev } from '$app/environment';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { thumbHashToRGBA } from 'thumbhash';

type Asset = {
	id: string;
	type: string;
	originalFileName: string;
	fileCreatedAt: string;
	thumbhash: string | null;
	exifInfo?: { dateTimeOriginal?: string };
};
export type Label = 'same' | 'different' | 'unsure';
export interface Pair {
	a: string;
	b: string;
	gapSeconds: number;
}

const PAIRS = 'tmp/label-pairs.json';
const LABELS = 'tmp/labels.json';

/** Coarse visual distance from thumbhashes — only used to stratify the sample, never shown. */
function thumbDist(a: Asset, b: Asset): number {
	const grid = (x: Asset) => {
		const { w, h, rgba } = thumbHashToRGBA(Buffer.from(x.thumbhash ?? '', 'base64'));
		const N = 12;
		return Array.from({ length: N * N * 3 }, (_, i) => {
			const p = Math.floor(i / 3);
			const sx = Math.min(w - 1, Math.floor(((p % N) + 0.5) * (w / N)));
			const sy = Math.min(h - 1, Math.floor((Math.floor(p / N) + 0.5) * (h / N)));
			return rgba[(sy * w + sx) * 4 + (i % 3)] / 255;
		});
	};
	const A = grid(a);
	const B = grid(b);
	return A.reduce((s, v, i) => s + Math.abs(v - B[i]), 0) / A.length;
}

/** Stratified sample of consecutive photo pairs: by time gap, and within each gap bucket by visual distance. */
async function buildPairs(): Promise<Pair[]> {
	const { assets } = JSON.parse(await readFile('tmp/library.json', 'utf8')) as { assets: Asset[] };
	const trashed = new Set<string>(
		existsSync('tmp/dedupe-trashed.json') ? JSON.parse(await readFile('tmp/dedupe-trashed.json', 'utf8')) : []
	);
	const t = (a: Asset) => new Date(a.exifInfo?.dateTimeOriginal ?? a.fileCreatedAt).getTime();
	const base = (a: Asset) => a.originalFileName.replace(/\.[^.]+$/, '').toLowerCase();
	const photos = assets
		.filter((a) => a.type === 'IMAGE' && a.thumbhash && !trashed.has(a.id))
		.sort((a, b) => t(a) - t(b));
	const candidates = photos
		.slice(1)
		.map((b, i) => ({ a: photos[i], b, gapSeconds: (t(b) - t(photos[i])) / 1000 }))
		.filter((p) => p.gapSeconds > 0 && base(p.a) !== base(p.b));

	let seed = 42;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const shuffle = <T>(xs: T[]) => xs.map((x) => [rnd(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);

	const buckets: [number, number, number][] = [
		[0, 8, 12],
		[8, 30, 14],
		[30, 120, 14],
		[120, 300, 10],
		[300, 1200, 10]
	];
	const out: Pair[] = [];
	for (const [lo, hi, n] of buckets) {
		const pool = shuffle(candidates.filter((p) => p.gapSeconds > lo && p.gapSeconds <= hi)).slice(0, 400);
		const scored = pool.map((p) => ({ ...p, d: thumbDist(p.a, p.b) })).sort((x, y) => x.d - y.d);
		// Spread picks evenly across the visual-distance range so both easy and hard cases appear.
		for (let k = 0; k < n; k++) {
			const p = scored[Math.floor(((k + 0.5) / n) * scored.length)];
			if (p) out.push({ a: p.a.id, b: p.b.id, gapSeconds: Math.round(p.gapSeconds) });
		}
	}
	return shuffle(out);
}

export const GET: RequestHandler = async () => {
	if (!dev) error(404);
	if (!existsSync(PAIRS)) await writeFile(PAIRS, JSON.stringify(await buildPairs()));
	const pairs = JSON.parse(await readFile(PAIRS, 'utf8')) as Pair[];
	const labels = existsSync(LABELS) ? (JSON.parse(await readFile(LABELS, 'utf8')) as Record<string, Label>) : {};
	return json({ pairs, labels });
};

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404);
	const { key, label } = (await request.json()) as { key: string; label: Label };
	const labels = existsSync(LABELS) ? JSON.parse(await readFile(LABELS, 'utf8')) : {};
	labels[key] = label;
	await writeFile(LABELS, JSON.stringify(labels, null, 1));
	return json({ ok: true, count: Object.keys(labels).length });
};
