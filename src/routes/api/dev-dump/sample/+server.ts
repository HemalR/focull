// TEMPORARY dev-only route: a few real groups from the metadata snapshot, for exercising the deck.
import { dev } from '$app/environment';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import type { AssetResponseDto } from '@immich/sdk';
import { groupAssets } from '$lib/grouping';
import { DEFAULT_SETTINGS } from '$lib/types';

export const GET: RequestHandler = async () => {
	if (!dev) error(404);
	const { assets } = JSON.parse(await readFile('tmp/library.json', 'utf8')) as { assets: AssetResponseDto[] };
	const groups = groupAssets(assets, DEFAULT_SETTINGS);
	const pick = [
		groups.find((g) => g.kind === 'photo' && g.assets.length >= 5 && g.assets.length <= 8),
		groups.find((g) => g.kind === 'photo' && g.assets.length === 1),
		groups.find((g) => g.kind === 'video' && g.assets.length >= 2)
	].filter((g) => g !== undefined);
	return json(pick);
};
