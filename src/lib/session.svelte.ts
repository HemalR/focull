import type { AssetResponseDto } from '@immich/sdk';
import { DEFAULT_SETTINGS, type CullGroup, type Fate, type GroupState, type SessionSource, type Settings } from './types';

export interface SessionData {
	source: SessionSource;
	settings: Settings;
	groups: CullGroup[];
	states: GroupState[];
	gi: number;
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
			gi: this.gi
		};
	}

	start(groups: CullGroup[], source: SessionSource, settings: Settings): void {
		this.groups = groups.map((g) => ({ ...g, assets: g.assets.map(slimAsset) }));
		this.states = this.groups.map((g) => ({
			championIdx: 0,
			queue: g.assets.map((_, i) => i).slice(1),
			fates: {}
		}));
		this.gi = 0;
		this.source = source;
		this.settings = { ...settings };
		this.#undo = [];
		this.rev++;
	}

	restore(data: SessionData): void {
		this.groups = data.groups;
		this.states = data.states;
		this.gi = Math.min(data.gi, data.groups.length - 1);
		this.source = data.source;
		this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
		this.#undo = [];
		this.rev++;
	}

	reset(): void {
		this.groups = [];
		this.states = [];
		this.gi = 0;
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
		const s = this.current;
		if (!s || s.queue.length === 0) return;
		this.#snapshot();
		s.fates[s.championIdx] = 'rejected';
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

	/** Advance to the next group. Deliberately not snapshotted — undo steps back into decisions, not navigation. */
	next(): void {
		if (this.gi + 1 < this.groups.length) {
			this.gi++;
			this.rev++;
		}
	}

	undo(): boolean {
		const snap = this.#undo.pop();
		if (!snap) return false;
		const { states, gi } = JSON.parse(snap) as { states: GroupState[]; gi: number };
		this.states = states;
		this.gi = gi;
		this.rev++;
		return true;
	}

	#decideChallenger(fate: Fate): void {
		const s = this.current;
		if (!s || s.queue.length === 0) return;
		this.#snapshot();
		s.fates[s.queue[0]] = fate;
		s.queue.shift();
		this.rev++;
	}

	#snapshot(): void {
		this.#undo.push(JSON.stringify({ states: $state.snapshot(this.states), gi: this.gi }));
		if (this.#undo.length > 500) this.#undo.shift();
	}
}

export const session = new CullSession();
