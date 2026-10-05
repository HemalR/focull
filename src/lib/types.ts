import type { AssetResponseDto } from '@immich/sdk';

export type GroupKind = 'photo' | 'video';

/** A scene/event of assets detected by time-gap grouping. Single-asset groups get a quick keep/cull pass instead of a battle. */
export interface CullGroup {
	id: string;
	kind: GroupKind;
	assets: AssetResponseDto[];
}

export type Fate = 'rejected' | 'kept' | 'reel';

/** Mutable battle state for one group. The champion is never in the queue; undecided assets wait in queue order. */
export interface GroupState {
	championIdx: number;
	queue: number[];
	fates: Record<number, Fate>;
	/**
	 * For rejected assets: the index of the asset they were culled against, so each reject
	 * stacks behind the keeper it actually lost to (resolved transitively at commit).
	 */
	lostTo?: Record<number, number>;
}

export type RejectAction = 'tag' | 'archive' | 'trash';

/** Which media a session takes in, in the order F cycles through them. */
export const MEDIA_FILTERS = ['photos', 'videos', 'both'] as const;
export type MediaFilter = (typeof MEDIA_FILTERS)[number];

export const MEDIA_LABELS: Record<MediaFilter, string> = {
	photos: 'photos only',
	videos: 'videos only',
	both: 'photos + videos'
};

export interface Settings {
	rejectAction: RejectAction;
	/** Tag applied to culled assets (when rejectAction is 'tag'). */
	tagName: string;
	/** Tag applied to every asset a committed session processed — the "already judged" marker. */
	reviewedTagName: string;
	/** Max gap between consecutive photos to count as one scene. */
	sceneGapSeconds: number;
	/** Max gap between end of one clip and start of the next to count as one event. */
	videoWindowSeconds: number;
	/** Which media sessions fetch (F in the picker cycles it). */
	media: MediaFilter;
}

export const DEFAULT_SETTINGS: Settings = {
	rejectAction: 'tag',
	tagName: 'focull/culled',
	reviewedTagName: 'focull/reviewed',
	sceneGapSeconds: 300,
	videoWindowSeconds: 600,
	media: 'both'
};

/** An Immich album, or one created at commit: no id yet, so it's matched by name. */
export interface AlbumRef {
	albumId?: string;
	name: string;
}

export const sameAlbum = (a: AlbumRef, b: AlbumRef): boolean =>
	a.albumId ? a.albumId === b.albumId : !b.albumId && a.name === b.name;

/** Assets bound for an album at commit. */
export interface StagedAlbum extends AlbumRef {
	assetIds: string[];
}

/** A location to give photos at commit, labelled the way Immich will show it: "Porto, Portugal". */
export interface Place {
	latitude: number;
	longitude: number;
	label: string;
}

/** Photos to move to a place at commit. */
export interface PlannedPlace {
	place: Place;
	assetIds: string[];
}

/** What an album or location palette works on: the current group, or one photo. */
export type PaletteScope = 'group' | 'photo';

/** From group `from` on, every keeper goes to `album` (null: none), until the next run starts. */
export interface AlbumRun {
	from: number;
	album: AlbumRef | null;
}

export type SessionSource =
	| { kind: 'unreviewed' }
	| { kind: 'duplicates' }
	| { kind: 'new'; takenAfter: string }
	| { kind: 'album'; albumId: string; albumName: string }
	| { kind: 'range'; takenAfter: string; takenBefore: string }
	/**
	 * The trip around a random never-judged photo (the anchor): while away from home, the whole
	 * trip; at home, a few days from the anchor's scene. `places`: its most photographed cities.
	 */
	| { kind: 'trip'; anchorId: string; takenAfter: string; takenBefore: string; places?: string[] };
