import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
import { durationMs } from './format';
import type { CullGroup, GroupKind, Settings } from './types';

export const takenAt = (a: AssetResponseDto): number =>
	new Date(a.exifInfo?.dateTimeOriginal ?? a.fileCreatedAt).getTime();

/** Photo groups longer than this are split at their widest internal gaps, keeping each battle bite-sized. */
export const MAX_PHOTO_GROUP = 40;

/**
 * Cluster assets into cull groups. Photos and videos are clustered separately, so a clip
 * never breaks up a run of photos:
 * - photos chain into scenes while consecutive shots are within sceneGapSeconds — generous on
 *   purpose: a stray unrelated photo costs one "keep both", a missed pairing costs the comparison;
 * - videos chain while the gap between the end of one clip and the start of the next is within
 *   videoWindowSeconds (clips cluster around events, and whole events make reels).
 * Groups come back in chronological order of their first asset.
 */
export function groupAssets(assets: AssetResponseDto[], settings: Settings): CullGroup[] {
	const sorted = [...assets].sort((a, b) => takenAt(a) - takenAt(b));
	const photos = sorted.filter((a) => a.type === AssetTypeEnum.Image);
	const videos = sorted.filter((a) => a.type === AssetTypeEnum.Video);
	return [
		...chain(photos, 'photo', settings.sceneGapSeconds * 1000).flatMap(splitLong),
		...chain(videos, 'video', settings.videoWindowSeconds * 1000)
	].sort((a, b) => takenAt(a.assets[0]) - takenAt(b.assets[0]));
}

/** Gap from the end of one asset (videos have duration) to the start of the next. */
const gapMs = (prev: AssetResponseDto, next: AssetResponseDto): number =>
	takenAt(next) - (takenAt(prev) + durationMs(prev.duration));

function chain(sorted: AssetResponseDto[], kind: GroupKind, maxGapMs: number): CullGroup[] {
	const groups: CullGroup[] = [];
	for (const asset of sorted) {
		const group = groups.at(-1);
		const prev = group?.assets.at(-1);
		if (group && prev && gapMs(prev, asset) <= maxGapMs) group.assets.push(asset);
		else groups.push({ id: asset.id, kind, assets: [asset] });
	}
	return groups;
}

/** Recursively split at the widest gap until every piece fits MAX_PHOTO_GROUP. */
function splitLong(group: CullGroup): CullGroup[] {
	const { assets } = group;
	if (assets.length <= MAX_PHOTO_GROUP) return [group];
	let cut = 1;
	for (let i = 2; i < assets.length; i++) {
		if (gapMs(assets[i - 1], assets[i]) > gapMs(assets[cut - 1], assets[cut])) cut = i;
	}
	const piece = (part: AssetResponseDto[]): CullGroup => ({ ...group, id: part[0].id, assets: part });
	return [...splitLong(piece(assets.slice(0, cut))), ...splitLong(piece(assets.slice(cut)))];
}
