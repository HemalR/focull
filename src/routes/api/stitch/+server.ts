import { json, error, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { apiKeyFrom, immichBase } from '$lib/server/immich';
import { spawn } from 'node:child_process';
import { createWriteStream, openAsBlob } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const FFMPEG = env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = env.FFPROBE_PATH ?? 'ffprobe';

/** Feature detection for the client: stitching only works where ffmpeg is installed. */
export const GET: RequestHandler = async () => {
	const available = await run(FFMPEG, ['-version']).then(
		() => true,
		() => false
	);
	return json({ available });
};

interface StitchRequest {
	assetIds?: string[];
	filename?: string;
}

interface AssetMeta {
	id: string;
	originalFileName: string;
	fileCreatedAt: string;
}

/**
 * Losslessly concatenate Immich video assets (stream copy, no re-encode) and upload the
 * result back to Immich. Clips must share codec/resolution/frame rate — mixed formats
 * are refused with a 422 rather than silently transcoded.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const base = immichBase();
	if (!base) error(500, 'IMMICH_URL is not configured');
	const key = apiKeyFrom(cookies);
	if (!key) error(401, 'Not authenticated');

	const { assetIds, filename } = (await request.json()) as StitchRequest;
	if (!assetIds || assetIds.length < 2) error(400, 'At least two assetIds are required');

	const dir = await mkdtemp(join(tmpdir(), 'focull-'));
	try {
		const headers = { 'x-api-key': key };
		const metas: AssetMeta[] = [];
		const files: string[] = [];

		for (const [i, id] of assetIds.entries()) {
			const infoRes = await fetch(`${base}/api/assets/${id}`, { headers });
			if (!infoRes.ok) error(502, `Immich returned ${infoRes.status} for asset ${id}`);
			const meta = (await infoRes.json()) as AssetMeta;
			metas.push(meta);

			const mediaRes = await fetch(`${base}/api/assets/${id}/original`, { headers });
			if (!mediaRes.ok || !mediaRes.body) error(502, `Could not download asset ${id}`);
			const file = join(dir, `clip-${i}${extname(meta.originalFileName) || '.mp4'}`);
			await pipeline(
				Readable.fromWeb(mediaRes.body as import('node:stream/web').ReadableStream),
				createWriteStream(file)
			);
			files.push(file);
		}

		const probes = await Promise.all(files.map(probe));
		const signatures = probes.map(
			(p) => `${p.vcodec}/${p.acodec}/${p.width}x${p.height}@${p.fps}`
		);
		if (new Set(signatures).size > 1) {
			return json(
				{
					message: 'Clips have mixed formats and cannot be losslessly stitched',
					formats: Object.fromEntries(metas.map((m, i) => [m.originalFileName, signatures[i]]))
				},
				{ status: 422 }
			);
		}

		const list = join(dir, 'concat.txt');
		await writeFile(list, files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join('\n'));
		const output = join(dir, 'stitched.mp4');
		await run(FFMPEG, ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-y', output]);

		const createdAt = metas.map((m) => m.fileCreatedAt).sort()[0];
		const durationMs = Math.round(probes.reduce((sum, p) => sum + p.durationSec, 0) * 1000);
		const name = filename ?? `focull-${createdAt.slice(0, 19).replaceAll(':', '-')}.mp4`;

		const blob = await openAsBlob(output, { type: 'video/mp4' });
		const form = new FormData();
		form.set('assetData', new File([blob], name, { type: 'video/mp4' }));
		form.set('filename', name);
		form.set('fileCreatedAt', createdAt);
		form.set('fileModifiedAt', new Date().toISOString());
		form.set('duration', String(durationMs));
		const uploadRes = await fetch(`${base}/api/assets`, { method: 'POST', headers, body: form });
		if (!uploadRes.ok) error(502, `Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
		const uploaded = (await uploadRes.json()) as { id: string };

		return json({ id: uploaded.id, filename: name, durationMs, clipCount: assetIds.length });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

interface ProbeResult {
	vcodec: string;
	acodec: string;
	width: number;
	height: number;
	fps: string;
	durationSec: number;
}

async function probe(file: string): Promise<ProbeResult> {
	const raw = await run(FFPROBE, [
		'-v', 'error',
		'-show_streams',
		'-show_format',
		'-of', 'json',
		file
	]);
	const data = JSON.parse(raw) as {
		streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string }[];
		format: { duration?: string };
	};
	const video = data.streams.find((s) => s.codec_type === 'video');
	const audio = data.streams.find((s) => s.codec_type === 'audio');
	if (!video) throw new Error(`No video stream in ${file}`);
	return {
		vcodec: video.codec_name,
		acodec: audio?.codec_name ?? 'none',
		width: video.width ?? 0,
		height: video.height ?? 0,
		fps: video.r_frame_rate ?? '?',
		durationSec: Number(data.format.duration ?? 0)
	};
}

function run(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
		child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-800)}`))
		);
	});
}
