import type { AssetResponseDto } from '@immich/sdk';
import {
	DEFAULT_SETTINGS,
	type CullGroup,
	type Fate,
	type GroupState,
	type SessionSource,
	type Settings,
	type StagedAlbum
} from './types';

export interface SessionData {
	source: SessionSource;
	settings: Settings;
	groups: CullGroup[];
	states: GroupState[];
	gi: number;
	/** Indices of groups the user skipped — left unfinished on purpose, never committed. */
	skipped: number[];
	/** Epoch ms when the session started, for the done-screen stats line. */
	startedAt: number;
	/** Album assignments staged during battle, applied at commit. */
	stagedAlbums: StagedAlbum[];
}

export interface Tally {
	kept: number;
	culled: number;
	reel: number;
}

/** Strip response fields the UI never reads so IndexedDB snapshots stay small. */
const slimAsset = (a: AssetResponseDto): AssetResponseDto => ({
	...a,
	owner: undefined,
	people: undefined,
	tags: undefined,
	stack: null,
	exifInfo: a.exifInfo
		? {
				dateTimeOriginal: a.exifInfo.dateTimeOriginal,
				exposureTime: a.exifInfo.exposureTime,
				fNumber: a.exifInfo.fNumber,
				iso: a.exifInfo.iso
			}
		: undefined
});

/**
 * One culling session: the detected groups, per-group battle state, and the cursor.
 * Undo is snapshot-based — a JSON snapshot of {states, gi} is pushed before every
 * fate-changing mutation, so undo always lands on a pending decision (never a gi
 * advance), even across group boundaries.
 */
class CullSession {
	source = $state<SessionSource | null>(null);
	settings = $state<Settings>({ ...DEFAULT_SETTINGS });
	groups = $state.raw<CullGroup[]>([]);
	states = $state<GroupState[]>([]);
	gi = $state(0);
	skipped = $state<number[]>([]);
	startedAt = $state(0);
	/** Not part of undo snapshots — album intent shouldn't vanish when a duel is undone. */
	stagedAlbums = $state<StagedAlbum[]>([]);
	/** Bumped on every mutation — watch it to persist. */
	rev = $state(0);
	#undo: string[] = [];

	get group(): CullGroup | undefined {
		return this.groups[this.gi];
	}

	get current(): GroupState | undefined {
		return this.states[this.gi];
	}

	get hasDecisions(): boolean {
		return this.gi > 0 || this.states.some((s) => Object.keys(s.fates).length > 0);
	}

	/** Total fates assigned across the whole session (for the stats line). */
	get decisionCount(): number {
		return this.states.reduce((sum, s) => sum + Object.keys(s.fates).length, 0);
	}

	/** Fully judged and not skipped — the groups buildPlan/commit should see. */
	isJudged(i: number): boolean {
		const group = this.groups[i];
		const s = this.states[i];
		if (!group || !s || this.skipped.includes(i)) return false;
		return group.assets.length === 1 ? s.fates[0] !== undefined : s.queue.length === 0;
	}

	/** Still needs the user's attention: not skipped and not judged. */
	isPending(i: number): boolean {
		return !this.skipped.includes(i) && !this.isJudged(i) && this.groups[i] !== undefined;
	}

	/** Session-wide live counts. Champions of finished multi-asset groups count as kept. */
	tally: Tally = $derived.by(() => {
		const t: Tally = { kept: 0, culled: 0, reel: 0 };
		this.states.forEach((s, i) => {
			for (const fate of Object.values(s.fates)) {
				if (fate === 'rejected') t.culled++;
				else if (fate === 'reel') t.reel++;
				else t.kept++;
			}
			const size = this.groups[i]?.assets.length ?? 0;
			if (size > 1 && s.queue.length === 0 && s.fates[s.championIdx] === undefined) t.kept++;
		});
		return t;
	});

	get data(): SessionData | null {
		if (!this.source) return null;
		return {
			source: $state.snapshot(this.source),
			settings: $state.snapshot(this.settings),
			groups: this.groups,
			states: $state.snapshot(this.states),
			gi: this.gi,
			skipped: $state.snapshot(this.skipped),
			startedAt: this.startedAt,
			stagedAlbums: $state.snapshot(this.stagedAlbums)
		};
	}

	start(groups: CullGroup[], source: SessionSource, settings: Settings): void {
		this.groups = groups.map((g) => ({ ...g, assets: g.assets.map(slimAsset) }));
		this.states = this.groups.map((g) => ({
			championIdx: 0,
			queue: g.assets.map((_, i) => i).slice(1),
			fates: {},
			lostTo: {}
		}));
		this.gi = 0;
		this.skipped = [];
		this.startedAt = Date.now();
		this.stagedAlbums = [];
		this.source = source;
		this.settings = { ...settings };
		this.#undo = [];
		this.rev++;
	}

	restore(data: SessionData): void {
		this.groups = data.groups;
		this.states = data.states.map((s) => ({ ...s, lostTo: s.lostTo ?? {} }));
		this.gi = Math.min(data.gi, data.groups.length - 1);
		this.skipped = data.skipped ?? [];
		this.startedAt = data.startedAt ?? Date.now();
		this.stagedAlbums = data.stagedAlbums ?? [];
		this.source = data.source;
		this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
		this.#undo = [];
		this.rev++;
	}

	reset(): void {
		this.groups = [];
		this.states = [];
		this.gi = 0;
		this.skipped = [];
		this.startedAt = 0;
		this.stagedAlbums = [];
		this.source = null;
		this.#undo = [];
		this.rev++;
	}

	/** Challenger (queue head) is culled; the champion holds. */
	defend(): void {
		this.#decideChallenger('rejected');
	}

	/** Both survive: challenger is kept alongside the champion. */
	both(): void {
		this.#decideChallenger('kept');
	}

	/** Video groups only: challenger becomes a reel clip. */
	reel(): void {
		this.#decideChallenger('reel');
	}

	/** Champion is culled; the challenger takes the crown. */
	dethrone(): void {
		this.#crown('rejected');
	}

	/** Challenger takes the crown but the old champion survives as kept. */
	promoteKeep(): void {
		this.#crown('kept');
	}

	/** Move an undecided asset to the front of the queue. */
	jumpTo(idx: number): void {
		const s = this.current;
		const pos = s?.queue.indexOf(idx) ?? -1;
		if (!s || pos <= 0) return;
		this.#snapshot();
		s.queue.splice(pos, 1);
		s.queue.unshift(idx);
		this.rev++;
	}

	/** Single-asset groups get a straight keep/cull call. */
	decideSingle(keep: boolean): void {
		const s = this.current;
		if (!s) return;
		this.#snapshot();
		s.fates[0] = keep ? 'kept' : 'rejected';
		this.rev++;
	}

	/** Leave the current group unfinished on purpose; commit and reviewed-tagging ignore it. */
	skipCurrent(): void {
		if (this.skipped.includes(this.gi)) return;
		this.#snapshot();
		this.skipped.push(this.gi);
		this.rev++;
	}

	/**
	 * Move to the next group that still needs judging (skipped ones excluded).
	 * Deliberately not snapshotted — undo steps back into decisions, not navigation.
	 * Returns false when none remain, i.e. it's review time.
	 */
	gotoNextPending(): boolean {
		for (let i = this.gi + 1; i < this.groups.length; i++) {
			if (this.isPending(i)) {
				this.gi = i;
				this.rev++;
				return true;
			}
		}
		return false;
	}

	/**
	 * Review-screen fate editing: rejected ↔ kept, with reel in the cycle when allowed.
	 * Only assets that already carry a fate cycle (the champion never has one).
	 */
	cycleFate(groupIdx: number, assetIdx: number, allowReel: boolean): Fate | null {
		const s = this.states[groupIdx];
		const fate = s?.fates[assetIdx];
		if (!s || fate === undefined) return null;
		const cycle: Fate[] = allowReel ? ['rejected', 'kept', 'reel'] : ['rejected', 'kept'];
		const next = cycle[(cycle.indexOf(fate) + 1) % cycle.length] ?? 'rejected';
		s.fates[assetIdx] = next;
		if (next === 'rejected') {
			if (assetIdx !== s.championIdx) (s.lostTo ??= {})[assetIdx] = s.championIdx;
		} else if (fate === 'rejected' && s.lostTo) {
			delete s.lostTo[assetIdx];
		}
		this.rev++;
		return next;
	}

	/**
	 * Stage/unstage an asset for an album (matched by albumId, or by name for
	 * to-be-created ones). Returns true when the asset is now staged.
	 */
	toggleAlbumStage(album: { albumId?: string; name: string }, assetId: string): boolean {
		const entry = this.stagedAlbums.find((s) =>
			album.albumId ? s.albumId === album.albumId : !s.albumId && s.name === album.name
		);
		if (!entry) {
			this.stagedAlbums.push({ albumId: album.albumId, name: album.name, assetIds: [assetId] });
			this.rev++;
			return true;
		}
		const idx = entry.assetIds.indexOf(assetId);
		if (idx === -1) entry.assetIds.push(assetId);
		else {
			entry.assetIds.splice(idx, 1);
			if (entry.assetIds.length === 0) this.stagedAlbums.splice(this.stagedAlbums.indexOf(entry), 1);
		}
		this.rev++;
		return idx === -1;
	}

	/** How many albums an asset is currently staged to. */
	stagedCount(assetId: string): number {
		return this.stagedAlbums.filter((s) => s.assetIds.includes(assetId)).length;
	}

	undo(): boolean {
		const snap = this.#undo.pop();
		if (!snap) return false;
		const { states, gi, skipped } = JSON.parse(snap) as {
			states: GroupState[];
			gi: number;
			skipped: number[];
		};
		this.states = states;
		this.gi = gi;
		this.skipped = skipped;
		this.rev++;
		return true;
	}

	#decideChallenger(fate: Fate): void {
		const s = this.current;
		if (!s || s.queue.length === 0) return;
		this.#snapshot();
		const challenger = s.queue[0];
		s.fates[challenger] = fate;
		// A defended challenger lost to the current champion — it stacks behind it at commit.
		if (fate === 'rejected') (s.lostTo ??= {})[challenger] = s.championIdx;
		s.queue.shift();
		this.rev++;
	}

	/** Challenger becomes champion; the old champion gets the given fate. */
	#crown(oldChampionFate: Fate): void {
		const s = this.current;
		if (!s || s.queue.length === 0) return;
		this.#snapshot();
		s.fates[s.championIdx] = oldChampionFate;
		const next = s.queue.shift();
		if (next !== undefined) {
			// A dethroned champion lost to the challenger that beat it.
			if (oldChampionFate === 'rejected') (s.lostTo ??= {})[s.championIdx] = next;
			s.championIdx = next;
		}
		this.rev++;
	}

	/** Cull the last one standing too — no lostTo entry, nothing beat it. */
	cullChampion(): void {
		const s = this.current;
		if (!s || s.fates[s.championIdx] === 'rejected') return;
		this.#snapshot();
		s.fates[s.championIdx] = 'rejected';
		this.rev++;
	}

	/**
	 * Review-screen winner editing: toggle the champion between alive (no fate) and
	 * culled. Returns true when the champion is now culled.
	 */
	toggleChampionCull(groupIdx: number): boolean {
		const s = this.states[groupIdx];
		if (!s) return false;
		const culled = s.fates[s.championIdx] !== 'rejected';
		if (culled) s.fates[s.championIdx] = 'rejected';
		else delete s.fates[s.championIdx];
		this.rev++;
		return culled;
	}

	#snapshot(): void {
		this.#undo.push(
			JSON.stringify({
				states: $state.snapshot(this.states),
				gi: this.gi,
				skipped: $state.snapshot(this.skipped)
			})
		);
		if (this.#undo.length > 500) this.#undo.shift();
	}
}

export const session = new CullSession();
