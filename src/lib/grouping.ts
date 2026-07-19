import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
import type { CullGroup, Settings } from './types';

export const takenAt = (a: AssetResponseDto): number =>
	new Date(a.exifInfo?.dateTimeOriginal ?? a.fileCreatedAt).getTime();

/**
 * Cluster assets into cull groups. Photos chain when consecutive shots are within
 * photoWindowSeconds of each other; videos chain when the gap between the end of one
 * clip and the start of the next is within videoWindowSeconds (clips cluster around events).
 */
export function groupAssets(assets: AssetResponseDto[], settings: Settings): CullGroup[] {
	const media = assets.filter(
		(a) => a.type === AssetTypeEnum.Image || a.type === AssetTypeEnum.Video
	);
	const sorted = [...media].sort((a, b) => takenAt(a) - takenAt(b));

	const groups: CullGroup[] = [];
	for (const asset of sorted) {
		const kind = asset.type === AssetTypeEnum.Video ? 'video' : 'photo';
		const group = groups.at(-1);
		const prev = group?.assets.at(-1);
		if (group && prev && group.kind === kind && gapMs(prev, asset) <= windowMs(kind, settings)) {
			group.assets.push(asset);
		} else {
			groups.push({ id: asset.id, kind, assets: [asset] });
		}
	}
	return groups;
}

const gapMs = (prev: AssetResponseDto, next: AssetResponseDto): number =>
	takenAt(next) - (takenAt(prev) + (prev.duration ?? 0));

const windowMs = (kind: CullGroup['kind'], s: Settings): number =>
	(kind === 'video' ? s.videoWindowSeconds : s.photoWindowSeconds) * 1000;
