import type { AssetResponseDto } from '@immich/sdk';
import { lacksLocation } from './places';
import {
	DEFAULT_SETTINGS,
	sameAlbum,
	type AlbumRef,
	type AlbumRun,
	type CullGroup,
	type Fate,
	type GroupState,
	type Place,
	type PlannedPlace,
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
	/** Indices of groups already committed partway through the session — never planned again. */
	committed: number[];
	/** Epoch ms when the session started, for the done-screen stats line. */
	startedAt: number;
	/** Single photos added to albums (Shift+A), applied at commit. */
	stagedAlbums: StagedAlbum[];
	/** Group albums (A), each carrying forward until the next run. */
	albumRuns: AlbumRun[];
	/** Photos left out of their group's album. */
	albumExcluded: string[];
	/** By group id: where that group's photos without a location go (P). */
	groupPlaces: Record<string, Place>;
	/** By asset id: one photo's own pick (Shift+P); null leaves its location as it is. */
	photoPlaces: Record<string, Place | null>;
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
				latitude: a.exifInfo.latitude,
				longitude: a.exifInfo.longitude,
				city: a.exifInfo.city,
				state: a.exifInfo.state,
				country: a.exifInfo.country
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
	committed = $state<number[]>([]);
	startedAt = $state(0);
	// Album intent isn't part of undo snapshots — it shouldn't vanish when a duel is undone.
	stagedAlbums = $state<StagedAlbum[]>([]);
	albumRuns = $state<AlbumRun[]>([]);
	albumExcluded = $state<string[]>([]);
	groupPlaces = $state<Record<string, Place>>({});
	photoPlaces = $state<Record<string, Place | null>>({});
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

	/** What the next commit covers: judged and not committed yet. */
	isCommittable(i: number): boolean {
		return this.isJudged(i) && !this.committed.includes(i);
	}

	/** Groups still waiting to be culled. */
	get pendingCount(): number {
		return this.groups.filter((_, i) => this.isPending(i)).length;
	}

	/** The committable groups just went to Immich: never plan them again, and undo can't reach back into them. */
	markCommitted(): void {
		this.committed = [...this.committed, ...this.groups.flatMap((_, i) => (this.isCommittable(i) ? [i] : []))];
		this.#undo = [];
		this.rev++;
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
			committed: $state.snapshot(this.committed),
			startedAt: this.startedAt,
			stagedAlbums: $state.snapshot(this.stagedAlbums),
			albumRuns: $state.snapshot(this.albumRuns),
			albumExcluded: $state.snapshot(this.albumExcluded),
			groupPlaces: $state.snapshot(this.groupPlaces),
			photoPlaces: $state.snapshot(this.photoPlaces)
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
		this.committed = [];
		this.startedAt = Date.now();
		this.stagedAlbums = [];
		this.albumRuns = [];
		this.albumExcluded = [];
		this.groupPlaces = {};
		this.photoPlaces = {};
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
		this.committed = data.committed ?? [];
		this.startedAt = data.startedAt ?? Date.now();
		this.stagedAlbums = data.stagedAlbums ?? [];
		this.albumRuns = data.albumRuns ?? [];
		this.albumExcluded = data.albumExcluded ?? [];
		this.groupPlaces = data.groupPlaces ?? {};
		this.photoPlaces = data.photoPlaces ?? {};
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
		this.committed = [];
		this.startedAt = 0;
		this.stagedAlbums = [];
		this.albumRuns = [];
		this.albumExcluded = [];
		this.groupPlaces = {};
		this.photoPlaces = {};
		this.source = null;
		this.#undo = [];
		this.rev++;
	}

	/** Challenger (queue head) is culled; the champion holds. */
	defend(): void {
		this.#decideChallenger('rejected');
	}

	/** Video groups only: challenger becomes a reel clip. */
	reel(): void {
		this.#decideChallenger('reel');
	}

	/** Champion is culled; the challenger takes the crown. */
	dethrone(): void {
		this.#crown('rejected');
	}

	/**
	 * Both survive, and the challenger becomes the one to beat: groups are scenes walked as a
	 * stream, so the newest keeper is the most relevant reference for the shots that follow.
	 */
	keepBoth(): void {
		this.#crown('kept');
	}

	/**
	 * Neither survives: both are culled, and the next challenger becomes the one to beat. With
	 * no challenger left, the group ends with no survivors (as cullChampion does).
	 */
	neither(): void {
		const s = this.current;
		const challenger = s?.queue[0];
		if (!s || challenger === undefined) return;
		this.#snapshot();
		s.fates[challenger] = 'rejected';
		s.fates[s.championIdx] = 'rejected';
		s.queue.shift();
		const next = s.queue.shift();
		if (next !== undefined) s.championIdx = next;
		this.rev++;
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

	/** The album group `gi`'s keepers go to: the latest run starting at or before it. */
	groupAlbum(gi = this.gi): AlbumRef | null {
		return this.albumRuns.findLast((r) => r.from <= gi)?.album ?? null;
	}

	/**
	 * From the current group on, keepers go to `album` (null: no album), until a later run.
	 * The groups it covers start afresh: their left-out photos go back in.
	 */
	setGroupAlbum(album: AlbumRef | null): void {
		const until = this.albumRuns.find((r) => r.from > this.gi)?.from ?? this.groups.length;
		const covered = new Set(this.groups.slice(this.gi, until).flatMap((g) => g.assets.map((a) => a.id)));
		this.albumExcluded = this.albumExcluded.filter((id) => !covered.has(id));
		const runs = this.albumRuns.filter((r) => r.from !== this.gi);
		runs.push({ from: this.gi, album: album && { albumId: album.albumId, name: album.name } });
		this.albumRuns = runs.sort((a, b) => a.from - b.from);
		this.rev++;
	}

	/** Every album an asset of group `gi` is bound for: its group's (unless left out), plus its own. */
	albumsOf(assetId: string, gi = this.gi): AlbumRef[] {
		const group = this.albumExcluded.includes(assetId) ? null : this.groupAlbum(gi);
		const own = this.stagedAlbums.filter((s) => s.assetIds.includes(assetId) && !(group && sameAlbum(s, group)));
		return group ? [group, ...own] : own;
	}

	/** Put one photo in, or take it out of, an album. Returns true when it's now in. */
	togglePhotoAlbum(album: AlbumRef, assetId: string, gi = this.gi): boolean {
		const join = !this.albumsOf(assetId, gi).some((a) => sameAlbum(a, album));
		const group = this.groupAlbum(gi);
		const staged = this.stagedAlbums.find((s) => sameAlbum(s, album));
		if (staged) staged.assetIds = staged.assetIds.filter((id) => id !== assetId);
		if (group && sameAlbum(group, album)) {
			// Its group's album takes it by default, so leaving it out is the exception to record.
			this.albumExcluded = this.albumExcluded.filter((id) => id !== assetId);
			if (!join) this.albumExcluded.push(assetId);
		} else if (join) {
			if (staged) staged.assetIds.push(assetId);
			else this.stagedAlbums.push({ albumId: album.albumId, name: album.name, assetIds: [assetId] });
		}
		this.stagedAlbums = this.stagedAlbums.filter((s) => s.assetIds.length > 0);
		this.rev++;
		return join;
	}

	/** Everything bound for albums: group albums (minus exceptions) merged with single photos. */
	albumAssignments(): StagedAlbum[] {
		const out: StagedAlbum[] = this.stagedAlbums.map((s) => ({
			albumId: s.albumId,
			name: s.name,
			assetIds: [...s.assetIds]
		}));
		this.groups.forEach((group, gi) => {
			const album = this.groupAlbum(gi);
			if (!album) return;
			let entry = out.find((s) => sameAlbum(s, album));
			if (!entry) out.push((entry = { albumId: album.albumId, name: album.name, assetIds: [] }));
			for (const { id } of group.assets) {
				if (!this.albumExcluded.includes(id) && !entry.assetIds.includes(id)) entry.assetIds.push(id);
			}
		});
		return out;
	}

	/** Where an asset of group `gi` moves at commit: its own pick, else its group's if it has no location. */
	plannedPlace(asset: AssetResponseDto, gi = this.gi): Place | null {
		const own = this.photoPlaces[asset.id];
		if (own !== undefined) return own;
		const group = this.groups[gi];
		return (group && lacksLocation(asset) && this.groupPlaces[group.id]) || null;
	}

	/** Send the current group's photos without a location to `place` (null: forget it). Returns how many that covers. */
	setGroupPlace(place: Place | null): number {
		const group = this.group;
		if (!group) return 0;
		if (place) this.groupPlaces[group.id] = place;
		else delete this.groupPlaces[group.id];
		this.rev++;
		return place ? group.assets.filter((a) => lacksLocation(a) && this.photoPlaces[a.id] === undefined).length : 0;
	}

	/** One photo's own pick: a place, or null to leave its location as it is. */
	setPhotoPlace(assetId: string, place: Place | null): void {
		this.photoPlaces[assetId] = place;
		this.rev++;
	}

	/** Every planned location move, one entry per place. */
	placeAssignments(): PlannedPlace[] {
		const out: PlannedPlace[] = [];
		this.groups.forEach((group, gi) => {
			for (const asset of group.assets) {
				const place = this.plannedPlace(asset, gi);
				if (!place) continue;
				const entry = out.find((e) => e.place.latitude === place.latitude && e.place.longitude === place.longitude);
				if (entry) entry.assetIds.push(asset.id);
				else out.push({ place: { ...place }, assetIds: [asset.id] });
			}
		});
		return out;
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
