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
}

export const DEFAULT_SETTINGS: Settings = {
	rejectAction: 'tag',
	tagName: 'focull/culled',
	reviewedTagName: 'focull/reviewed',
	sceneGapSeconds: 300,
	videoWindowSeconds: 600
};

/** Album assignment staged mid-battle (A key), applied at commit. On-the-spot albums have no id yet. */
export interface StagedAlbum {
	albumId?: string;
	name: string;
	assetIds: string[];
}

export type SessionSource =
	| { kind: 'unreviewed' }
	| { kind: 'duplicates' }
	| { kind: 'new'; takenAfter: string }
	| { kind: 'album'; albumId: string; albumName: string }
	| { kind: 'range'; takenAfter: string; takenBefore: string }
	/** A few random days of library, opening on the scene of a random never-judged photo (the anchor). */
	| { kind: 'trip'; anchorId: string; takenAfter: string; takenBefore: string };
