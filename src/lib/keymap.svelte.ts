import {
	createHotkey,
	formatForDisplay,
	HotkeyRecorder,
	normalizeHotkeyFromParsed,
	parseHotkey,
	validateHotkey,
	type CreateHotkeyOptions,
	type Hotkey,
	type HotkeyCallback
} from '@tanstack/svelte-hotkeys';
import type { Attachment } from 'svelte/attachments';
import { clearToast, notify } from './toast.svelte';

type Section = 'battle' | 'singles' | 'video groups' | 'picker' | 'everywhere';

interface ActionDef {
	/** Default keys (main first, at most MAX_KEYS), in TanStack's normalised form: 'B', 'ArrowLeft', 'Shift+K'. */
	keys: Hotkey[];
	/** Short name for toasts: "keep both". */
	name: string;
	/** The cheatsheet's description. */
	label: string;
	section: Section;
	/** Held down rather than pressed. */
	hold?: true;
}

/**
 * Every rebindable action. Keys are unique app-wide (rebinding swaps on a clash), so one
 * action can serve several screens — undo, cull and confirm mean the same thing everywhere.
 * The battle's direction keys have vim twins: h ← · l → · k ↑ · j ↓.
 */
const DEFAULTS = {
	defend: {
		keys: ['ArrowLeft', 'H'],
		name: 'champion stays',
		label: 'champion stays — challenger culled (or click champion)',
		section: 'battle'
	},
	dethrone: {
		keys: ['ArrowRight', 'L'],
		name: 'challenger wins',
		label: 'challenger wins — champion culled (or click challenger)',
		section: 'battle'
	},
	keepBoth: {
		keys: ['B'],
		name: 'keep both',
		label: 'keep both — challenger becomes the one to beat',
		section: 'battle'
	},
	album: {
		keys: ['A'],
		name: 'group album',
		label: 'album for this group and the ones after it — every keeper goes in at commit',
		section: 'battle'
	},
	albumPhoto: {
		keys: ['Shift+A'],
		name: 'photo album',
		label: 'put just the champion in an album, or take it out (tab switches in the palette)',
		section: 'battle'
	},
	location: {
		keys: ['P'],
		name: 'group location',
		label: 'location for this group’s photos that have none — set at commit',
		section: 'battle'
	},
	locationPhoto: {
		keys: ['Shift+P'],
		name: 'photo location',
		label: 'location for just the champion, even if it has one (tab switches in the palette)',
		section: 'battle'
	},
	skip: { keys: ['G'], name: 'skip group', label: 'skip group — stays unreviewed', section: 'battle' },
	undo: {
		keys: ['U'],
		name: 'undo',
		label: 'undo last decision (group summary: restores the crown, or the last duel)',
		section: 'battle'
	},
	liftChallenger: {
		keys: ['ArrowUp', 'K'],
		name: 'full screen challenger',
		label: 'full screen the challenger',
		section: 'battle',
		hold: true
	},
	liftChampion: {
		keys: ['ArrowDown', 'J'],
		name: 'full screen champion',
		label: 'full screen the champion',
		section: 'battle',
		hold: true
	},
	zoom: { keys: ['Z'], name: 'zoom', label: 'full-res zoom · mouse pans both panes', section: 'battle' },
	keep: {
		keys: ['Space'],
		name: 'keep',
		label: 'keep · held up full screen: it wins',
		section: 'singles'
	},
	cull: {
		keys: ['X'],
		name: 'cull',
		label: 'cull · held up full screen: it loses · group summary: cull the last one standing too',
		section: 'singles'
	},
	reel: {
		keys: ['S'],
		name: 'add to reel',
		label: 'add challenger to reel (stitched on commit)',
		section: 'video groups'
	},
	mute: { keys: ['M'], name: 'mute', label: 'mute / unmute', section: 'video groups' },
	trip: { keys: ['T'], name: 'random trip', label: 'random trip (also what the app opens on)', section: 'picker' },
	unreviewed: { keys: ['1'], name: 'unreviewed', label: 'unreviewed', section: 'picker' },
	newSince: { keys: ['2'], name: 'new since last cull', label: 'new since last cull', section: 'picker' },
	pickAlbum: { keys: ['3'], name: 'pick an album', label: 'one album', section: 'picker' },
	range: { keys: ['4'], name: 'date range', label: 'date range', section: 'picker' },
	duplicates: { keys: ['5'], name: 'duplicates', label: 'duplicates', section: 'picker' },
	media: {
		keys: ['F'],
		name: 'media filter',
		label: 'cycle photos only → videos only → both, for every session',
		section: 'picker'
	},
	settings: { keys: [','], name: 'settings', label: 'settings', section: 'picker' },
	review: {
		keys: ['C'],
		name: 'review & commit now',
		label: 'review & commit the groups you’ve finished — the rest wait, and you can keep culling after',
		section: 'everywhere'
	},
	confirm: {
		keys: ['Enter'],
		name: 'confirm',
		label: 'confirm · next group · commit · another trip',
		section: 'everywhere'
	},
	pickSession: { keys: ['R'], name: 'pick a session', label: 'done screen: pick a session', section: 'everywhere' }
} satisfies Record<string, ActionDef>;

export type Action = keyof typeof DEFAULTS;
export const ACTIONS: Readonly<Record<Action, ActionDef>> = DEFAULTS;

const ACTION_IDS = Object.keys(ACTIONS) as Action[];

/** Rows that aren't rebindable keys: pointer and gestures, plus Esc and ? (always the way out and the way to help). */
interface FixedRow {
	keys: string;
	label: string;
}

const FIXED: Partial<Record<Section | 'swipe deck (touch / narrow screens)' | 'review', FixedRow[]>> = {
	battle: [
		{ keys: 'while held', label: 'the stays / wins keys flip between the two · keep / cull judge the one shown' },
		{ keys: 'shift + hover', label: '2× magnifier loupe under the cursor' },
		{ keys: 'click thumb', label: 'battle an undecided asset next' }
	],
	'swipe deck (touch / narrow screens)': [
		{ keys: '← swipe', label: 'cull the photo' },
		{ keys: '→ swipe', label: 'keep it — it becomes the one to beat' },
		{ keys: '↑ swipe', label: 'crown it — the old one to beat is culled' },
		{ keys: '↓ swipe', label: 'add to reel (video groups)' },
		{ keys: 'hold', label: 'see the one to beat in its place (tap the inset to pin)' },
		{ keys: 'double-tap', label: 'zoom · drag pans · hold still compares' }
	],
	review: [{ keys: 'click thumb', label: 'cycle fate — culled → kept (→ reel for video)' }],
	everywhere: [
		{ keys: 'esc', label: 'back to picker · close overlays · cancel a recording' },
		{ keys: '?', label: 'this cheatsheet' }
	]
};

/** The `?` cheatsheet, in order: each section's rebindable actions, then its fixed rows. */
export const CHEATSHEET = (
	['battle', 'swipe deck (touch / narrow screens)', 'singles', 'video groups', 'review', 'picker', 'everywhere'] as const
).map((title) => ({
	title,
	actions: ACTION_IDS.filter((a) => ACTIONS[a].section === title),
	fixed: FIXED[title] ?? []
}));

/** Never bindable: Esc and ? stay fixed, Tab stays focus navigation. */
const RESERVED = new Set(['Escape', 'Tab', '?', 'Shift+?']);
/** An action's main key plus one alternative. */
export const MAX_KEYS = 2;
const STORAGE = 'focull.keys';

/** How a key reads on screen: "B", "←", "↵", "space", "Ctrl+K". */
export const keyLabel = (key: Hotkey): string => formatForDisplay(key).replace('␣', 'space');

type KeyLists = Partial<Record<Action, Hotkey[]>>;

/** One of an action's keys: its main key (slot 0) or its alternative (slot 1). */
interface KeySlot {
	action: Action;
	slot: number;
}

/**
 * The live key bindings: defaults plus this device's overrides (localStorage), and the
 * recorder that captures a new key for one slot at a time.
 */
class Keymap {
	#custom = $state<KeyLists>(load());
	/** The key slot waiting for its new key. */
	recording = $state<KeySlot | null>(null);
	/** Shift was down for the shift-click that started recording, and hasn't been let go yet. */
	#clickShift = false;
	#listeners: AbortController | null = null;
	#recorder = new HotkeyRecorder({
		onRecord: (key) => this.#recorded(key),
		onCancel: () => this.#stop()
	});

	/**
	 * An action's keys, main first: this device's own, else its defaults minus any another
	 * action has been given since (so a newly added default can't clash with a custom key).
	 */
	of = (action: Action): Hotkey[] =>
		this.#custom[action] ??
		ACTIONS[action].keys.filter((k) => !ACTION_IDS.some((a) => a !== action && this.#custom[a]?.includes(k)));

	isCustom = (action: Action): boolean => this.#custom[action] !== undefined;
	get anyCustom(): boolean {
		return ACTION_IDS.some(this.isCustom);
	}

	isRecording = (action: Action, slot = 0): boolean =>
		this.recording?.action === action && this.recording.slot === slot;

	/**
	 * Wait for the next key press and make it the action's key in `slot` — one past its last
	 * adds a key. Esc, or a click anywhere, cancels.
	 */
	record = (action: Action, slot = 0, shiftHeld = false): void => {
		this.#stop();
		this.recording = { action, slot: Math.min(slot, this.of(action).length, MAX_KEYS - 1) };
		this.#clickShift = shiftHeld;
		this.#listeners = new AbortController();
		const { signal } = this.#listeners;
		window.addEventListener('pointerdown', this.#stop, { capture: true, signal });
		window.addEventListener('keyup', (e) => e.key === 'Shift' && (this.#clickShift = false), { signal });
		this.#recorder.start();
		const adding = this.recording.slot === this.of(action).length;
		notify(`press ${adding ? 'another' : 'a new'} key for ${ACTIONS[action].name} — esc cancels`, false, 5000);
	};

	/** Drop one of an action's keys — never its last. */
	removeKey = (action: Action, slot: number): void => {
		const keys = this.of(action);
		if (keys.length < 2) return;
		this.#save({ ...this.#custom, [action]: keys.filter((_, i) => i !== slot) });
		notify(`${ACTIONS[action].name}: ${keyLabel(keys[slot])} removed`);
	};

	/** Back to the default keys, taken back from whichever actions hold them now. */
	reset = (action: Action): void => {
		const defaults = ACTIONS[action].keys;
		defaults.forEach((key, slot) => this.#bind(action, slot, key));
		this.#save({ ...this.#custom, [action]: this.of(action).slice(0, defaults.length) });
		notify(`${ACTIONS[action].name} → ${defaults.map(keyLabel).join(' / ')}`);
	};

	resetAll = (): void => {
		this.#save({});
		notify('all keys back to defaults');
	};

	#stop = (): void => {
		if (this.recording) clearToast(); // the "press a new key" prompt
		this.#listeners?.abort();
		this.#listeners = null;
		this.#recorder.stop();
		this.recording = null;
	};

	#recorded(recorded: Hotkey | ''): void {
		const target = this.recording;
		const clickShift = this.#clickShift;
		this.#stop();
		// Backspace/Delete come through as '' — × in the cheatsheet removes keys instead.
		if (!target || recorded === '') return;
		const key = clickShift ? withoutShift(recorded) : recorded;
		if (RESERVED.has(key)) {
			notify(`${keyLabel(key)} is reserved — nothing changed`, true);
			return;
		}
		this.#bind(target.action, target.slot, key);
	}

	/**
	 * Make `key` the action's key in `slot`. Whichever action had it takes the replaced key in
	 * exchange, or, when nothing was replaced, just gives it up (if that leaves it a key).
	 */
	#bind(action: Action, slot: number, key: Hotkey): void {
		const { name } = ACTIONS[action];
		const keys = [...this.of(action)];
		const old: Hotkey | undefined = keys[slot];
		if (key === old) return;
		if (keys.includes(key)) {
			notify(`${keyLabel(key)} is already a key for ${name}`, true);
			return;
		}
		const next: KeyLists = { ...this.#custom };
		const taker = ACTION_IDS.find((a) => a !== action && this.of(a).includes(key));
		let swap = '';
		if (taker) {
			const theirs = this.of(taker);
			if (!old && theirs.length === 1) {
				notify(`${keyLabel(key)} is ${ACTIONS[taker].name}'s only key — give it another first`, true);
				return;
			}
			next[taker] = old ? theirs.map((k) => (k === key ? old : k)) : theirs.filter((k) => k !== key);
			swap = old ? ` · ${ACTIONS[taker].name} moved to ${keyLabel(old)}` : ` · taken from ${ACTIONS[taker].name}`;
		}
		keys[slot] = key;
		next[action] = keys;
		this.#save(next);
		notify(`${name} → ${keys.map(keyLabel).join(' / ')}${swap}`, false, 3000);
	}

	/** Store only what differs from the defaults, so improved defaults still reach untouched keys. */
	#save(next: KeyLists): void {
		const custom: KeyLists = {};
		for (const a of ACTION_IDS) {
			const keys = next[a];
			if (keys && keys.join('|') !== ACTIONS[a].keys.join('|')) custom[a] = keys;
		}
		this.#custom = custom;
		localStorage.setItem(STORAGE, JSON.stringify(custom));
	}
}

/** This device's custom keys. Older saves held one key per action, as a plain string. */
function load(): KeyLists {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
		if (!raw || typeof raw !== 'object') return {};
		const stored = new Map(Object.entries(raw));
		const custom: KeyLists = {};
		for (const a of ACTION_IDS) {
			const keys = [stored.get(a)].flat().filter(isHotkey).slice(0, MAX_KEYS);
			if (keys.length > 0) custom[a] = keys;
		}
		return custom;
	} catch {
		return {};
	}
}

const isHotkey = (key: unknown): key is Hotkey => typeof key === 'string' && validateHotkey(key).valid;

/**
 * Drop a Shift that belongs to the shift-click rather than the shortcut. Punctuation keeps
 * it: there, Shift is what turns "/" into "?".
 */
function withoutShift(key: Hotkey): Hotkey {
	const parsed = parseHotkey(key);
	if (!parsed.shift || /^[^A-Za-z0-9]$/.test(parsed.key)) return key;
	return normalizeHotkeyFromParsed({
		...parsed,
		shift: false,
		modifiers: parsed.modifiers.filter((m) => m !== 'Shift')
	});
}

export const keys = new Keymap();

/** Stands in for an empty key slot, whose registration stays disabled. */
const UNUSED: Hotkey = 'F12';

/**
 * Run `callback` on any of the action's current keys, following rebinds live. Several screens
 * can register one action (each gating itself with `enabled`), so overlaps are expected.
 */
export function onKey(
	action: Action,
	callback: HotkeyCallback,
	options: CreateHotkeyOptions | (() => CreateHotkeyOptions) = {}
): void {
	for (let slot = 0; slot < MAX_KEYS; slot++) {
		createHotkey(
			() => keys.of(action)[slot] ?? UNUSED,
			callback,
			() => {
				const resolved = typeof options === 'function' ? options() : options;
				const bound = keys.of(action)[slot] !== undefined;
				return { conflictBehavior: 'allow', ...resolved, enabled: bound && (resolved.enabled ?? true) };
			}
		);
	}
}

/** Shift-click records a new key for the action's `slot` instead of clicking the element. */
export const rebindable =
	(action: Action, slot = 0): Attachment<HTMLElement> =>
	(node) => {
		const { title } = node;
		node.title = title ? `${title} · shift-click to change its key` : 'shift-click to change its key';
		const listeners = new AbortController();
		const { signal } = listeners;
		// Shift-mousedown would otherwise extend a text selection.
		node.addEventListener('mousedown', (e) => e.shiftKey && e.preventDefault(), { signal });
		node.addEventListener(
			'click',
			(e) => {
				if (!e.shiftKey) return;
				e.preventDefault();
				e.stopImmediatePropagation();
				keys.record(action, slot, true);
			},
			{ capture: true, signal }
		);
		return () => {
			listeners.abort();
			node.title = title;
		};
	};
