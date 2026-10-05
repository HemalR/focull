import {
	AssetOrder,
	AssetTypeEnum,
	AssetVisibility,
	getAllTags,
	getAssetDuplicates,
	getServerVersion,
	searchAssets,
	searchRandom,
	type AssetResponseDto,
	type MetadataSearchDto
} from '@immich/sdk';
import { takenAt } from './grouping';
import { topCities, tripSpan } from './trips';
import type { CullGroup, MediaFilter, SessionSource, Settings } from './types';

/** The one asset type a media filter keeps; undefined keeps both. */
const typeFor = (media: MediaFilter): AssetTypeEnum | undefined =>
	({ photos: AssetTypeEnum.Image, videos: AssetTypeEnum.Video, both: undefined })[media];

export interface AuthUser {
	name: string;
	email: string;
}

export interface AuthStatus {
	configured: boolean;
	authenticated: boolean;
	envKey?: boolean;
	user?: AuthUser | null;
}

export const getAuthStatus = async (): Promise<AuthStatus> => {
	const res = await fetch('/api/auth');
	if (!res.ok) throw new Error(`auth check failed (${res.status})`);
	return (await res.json()) as AuthStatus;
};

export async function login(apiKey: string): Promise<AuthUser> {
	const res = await fetch('/api/auth', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ apiKey })
	});
	if (!res.ok) {
		let message = `Login failed (${res.status})`;
		try {
			const body = (await res.json()) as { message?: string };
			if (body.message) message = body.message;
		} catch {
			// keep the fallback message
		}
		throw new Error(message);
	}
	return ((await res.json()) as { user: AuthUser }).user;
}

export const logout = async (): Promise<void> => {
	await fetch('/api/auth', { method: 'DELETE' });
};

export const checkStitch = async (): Promise<boolean> => {
	try {
		const res = await fetch('/api/stitch');
		return res.ok && ((await res.json()) as { available: boolean }).available;
	} catch {
		return false;
	}
};

async function searchPaged(
	dto: MetadataSearchDto,
	onPage?: (items: AssetResponseDto[]) => void
): Promise<AssetResponseDto[]> {
	const all: AssetResponseDto[] = [];
	let page: number | null = 1;
	while (page !== null) {
		const result = await searchAssets({ metadataSearchDto: { ...dto, page } });
		all.push(...result.assets.items);
		onPage?.(result.assets.items);
		const next: string | null = result.assets.nextPage;
		page = next === null ? null : Number(next);
	}
	return all;
}

/**
 * IDs of every asset carrying one of the given tag paths. Immich search can filter
 * FOR a tag but not against one, so exclusion means collecting these up front.
 */
async function fetchTaggedAssetIds(tagPaths: string[]): Promise<Set<string>> {
	const tags = await getAllTags();
	const tagIds = tags.filter((t) => tagPaths.includes(t.value)).map((t) => t.id);
	if (tagIds.length === 0) return new Set();
	const tagged = await searchPaged({ tagIds, size: 1000, withExif: false });
	return new Set(tagged.map((a) => a.id));
}

/** Pull every asset matching the session source, then drop trashed / stacked / already-judged ones. */
export async function fetchSessionAssets(
	source: SessionSource,
	settings: Settings,
	onProgress?: (count: number) => void
): Promise<AssetResponseDto[]> {
	const base: MetadataSearchDto = {
		type: typeFor(settings.media),
		withExif: true,
		visibility: AssetVisibility.Timeline,
		withStacked: false,
		order: AssetOrder.Asc,
		size: 1000
	};
	if (source.kind === 'album') base.albumIds = [source.albumId];
	if ('takenAfter' in source) base.takenAfter = source.takenAfter;
	if ('takenBefore' in source) base.takenBefore = source.takenBefore;

	const judged = await fetchTaggedAssetIds([settings.reviewedTagName, settings.tagName]);
	let count = 0;
	const all = await searchPaged(base, (items) => onProgress?.((count += items.length)));
	return all.filter((a) => !a.isTrashed && !a.stack && !judged.has(a.id));
}

/** How far around the anchor to look — wide enough for a 30-day trip, and to tell where home was. */
const TRIP_SEARCH_MS = 45 * 86_400_000;

export interface Trip {
	source: Extract<SessionSource, { kind: 'trip' }>;
	/** The trip's unjudged assets, ready to group. */
	assets: AssetResponseDto[];
}

/**
 * The trip around a random never-judged photo (or video, when only videos are wanted): see
 * tripSpan. Random picks land in dense stretches more often, which is where culling pays off.
 * Null when a sample turns up nothing unjudged.
 */
export async function pickTrip(settings: Settings): Promise<Trip | null> {
	const type = typeFor(settings.media);
	const [sample, judged] = await Promise.all([
		searchRandom({
			randomSearchDto: {
				size: 100,
				type: type ?? AssetTypeEnum.Image,
				visibility: AssetVisibility.Timeline,
				withStacked: false,
				withExif: true
			}
		}),
		fetchTaggedAssetIds([settings.reviewedTagName, settings.tagName])
	]);
	const anchor = sample.find((a) => !a.isTrashed && !a.stack && !judged.has(a.id));
	if (!anchor) return null;
	const t = takenAt(anchor);
	// Judged photos still say where you were, so they count towards finding the trip.
	const around = await searchPaged({
		type,
		withExif: true,
		visibility: AssetVisibility.Timeline,
		withStacked: false,
		order: AssetOrder.Asc,
		size: 1000,
		takenAfter: new Date(t - TRIP_SEARCH_MS).toISOString(),
		takenBefore: new Date(t + TRIP_SEARCH_MS).toISOString()
	});
	const { start, end } = tripSpan(around, anchor, settings.sceneGapSeconds * 1000);
	const onTrip = around.filter((a) => takenAt(a) >= start && takenAt(a) <= end);
	return {
		source: {
			kind: 'trip',
			anchorId: anchor.id,
			takenAfter: new Date(start).toISOString(),
			takenBefore: new Date(end).toISOString(),
			places: topCities(onTrip)
		},
		assets: onTrip.filter((a) => !a.isTrashed && !a.stack && !judged.has(a.id))
	};
}

/**
 * Immich's visual duplicate detection as ready-made battle groups. The suggested keeper
 * leads each group, so it opens as champion.
 */
export async function fetchDuplicateGroups(settings: Settings): Promise<CullGroup[]> {
	const [duplicates, judged] = await Promise.all([
		getAssetDuplicates(),
		fetchTaggedAssetIds([settings.reviewedTagName, settings.tagName])
	]);
	const type = typeFor(settings.media);
	const groups: CullGroup[] = [];
	for (const dup of duplicates) {
		const usable = dup.assets.filter(
			(a) => !a.isTrashed && !a.stack && !judged.has(a.id) && (!type || a.type === type)
		);
		if (usable.length < 2) continue;
		const suggested = new Set(dup.suggestedKeepAssetIds);
		usable.sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)) || takenAt(a) - takenAt(b));
		groups.push({
			id: dup.duplicateId,
			kind: usable[0].type === AssetTypeEnum.Video ? 'video' : 'photo',
			assets: usable
		});
	}
	return groups;
}

/** Immich server major version focull has been built and tested against. */
export const TESTED_IMMICH_MAJOR = 3;

export interface ServerInfo {
	version: string;
	compatible: boolean;
}

export async function getServerInfo(): Promise<ServerInfo | null> {
	try {
		const v = await getServerVersion();
		return {
			version: `v${v.major}.${v.minor}.${v.patch}`,
			compatible: v.major === TESTED_IMMICH_MAJOR
		};
	} catch {
		return null;
	}
}
