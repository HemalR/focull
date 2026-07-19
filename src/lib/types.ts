import type { AssetResponseDto } from '@immich/sdk';

export type GroupKind = 'photo' | 'video';

/** A burst/cluster of assets detected by time-window grouping. Single-asset groups get a quick keep/cull pass instead of a battle. */
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
}

export type RejectAction = 'tag' | 'archive' | 'trash';

export interface Settings {
	rejectAction: RejectAction;
	/** Tag applied to culled assets (when rejectAction is 'tag'). */
	tagName: string;
	/** Tag applied to every asset a committed session processed — the "already judged" marker. */
	reviewedTagName: string;
	/** Max gap between consecutive photos to count as one burst. */
	photoWindowSeconds: number;
	/** Max gap between end of one clip and start of the next to count as one event. */
	videoWindowSeconds: number;
	/** Magnifier loupe following the cursor over battle panes (outside Z-zoom). */
	hoverLoupe: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	rejectAction: 'tag',
	tagName: 'focull/culled',
	reviewedTagName: 'focull/reviewed',
	photoWindowSeconds: 8,
	videoWindowSeconds: 600,
	hoverLoupe: true
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
	| { kind: 'range'; takenAfter: string; takenBefore: string };
