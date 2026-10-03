import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { groupAssets, MAX_PHOTO_GROUP } from './grouping';
import { DEFAULT_SETTINGS } from './types';

const T0 = Date.parse('2024-05-01T10:00:00Z');

/** Minimal asset taken `seconds` after T0; only the fields grouping reads. */
const asset = (id: string, seconds: number, type = AssetTypeEnum.Image, durationMs = 0) =>
	({
		id,
		type,
		duration: durationMs,
		fileCreatedAt: new Date(T0 + seconds * 1000).toISOString()
	}) as unknown as AssetResponseDto;

const ids = (assets: AssetResponseDto[]) =>
	groupAssets(assets, DEFAULT_SETTINGS).map((g) => g.assets.map((a) => a.id));

describe('groupAssets', () => {
	it('chains photos into scenes within the scene gap, and breaks beyond it', () => {
		const gap = DEFAULT_SETTINGS.sceneGapSeconds;
		expect(ids([asset('a', 0), asset('b', gap), asset('c', 2 * gap + 1)])).toEqual([['a', 'b'], ['c']]);
	});

	it('keeps videos in their own groups without splitting the photo scene around them', () => {
		const groups = groupAssets(
			[asset('p1', 0), asset('v', 10, AssetTypeEnum.Video, 5000), asset('p2', 20)],
			DEFAULT_SETTINGS
		);
		expect(groups.map((g) => [g.kind, g.assets.map((a) => a.id)])).toEqual([
			['photo', ['p1', 'p2']],
			['video', ['v']]
		]);
	});

	it('measures video gaps from the end of the previous clip', () => {
		const clipMs = 60 * 60 * 1000;
		const after = clipMs / 1000 + DEFAULT_SETTINGS.videoWindowSeconds;
		const clips = [asset('v1', 0, AssetTypeEnum.Video, clipMs), asset('v2', after, AssetTypeEnum.Video)];
		expect(ids(clips)).toEqual([['v1', 'v2']]);
	});

	it('splits overlong scenes at their widest gap', () => {
		const n = MAX_PHOTO_GROUP + 10;
		// Shots every 2s, with one 30s pause after the 25th.
		const shots = Array.from({ length: n }, (_, i) => asset(`s${i}`, i * 2 + (i >= 25 ? 30 : 0)));
		const sizes = ids(shots).map((g) => g.length);
		expect(sizes).toEqual([25, n - 25]);
	});
});
