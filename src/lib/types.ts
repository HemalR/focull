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
	tagName: string;
	/** Max gap between consecutive photos to count as one burst. */
	photoWindowSeconds: number;
	/** Max gap between end of one clip and start of the next to count as one event. */
	videoWindowSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
	rejectAction: 'tag',
	tagName: 'foculled',
	photoWindowSeconds: 8,
	videoWindowSeconds: 600
};

export type SessionSource =
	| { kind: 'new'; takenAfter: string }
	| { kind: 'album'; albumId: string; albumName: string }
	| { kind: 'range'; takenAfter: string; takenBefore: string };
