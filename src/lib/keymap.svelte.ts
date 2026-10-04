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
	/** Default key, in TanStack's normalised form: 'B', 'ArrowLeft', 'Enter', 'Shift+K'. */
	key: Hotkey;
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
 */
const DEFAULTS = {
	defend: {
		key: 'ArrowLeft',
		name: 'champion stays',
		label: 'champion stays — challenger culled (or click champion)',
		section: 'battle'
	},
	dethrone: {
		key: 'ArrowRight',
		name: 'challenger wins',
		label: 'challenger wins — champion culled (or click challenger)',
		section: 'battle'
	},
	keepBoth: {
		key: 'B',
		name: 'keep both',
		label: 'keep both — challenger becomes the one to beat',
		section: 'battle'
	},
	album: {
		key: 'A',
		name: 'album',
		label: 'album palette — stage the champion, applied at commit',
		section: 'battle'
	},
	skip: { key: 'G', name: 'skip group', label: 'skip group — stays unreviewed', section: 'battle' },
	undo: {
		key: 'U',
		name: 'undo',
		label: 'undo last decision (group summary: restores the crown, or the last duel)',
		section: 'battle'
	},
	liftChallenger: {
		key: 'ArrowUp',
		name: 'full screen challenger',
		label: 'full screen the challenger',
		section: 'battle',
		hold: true
	},
	liftChampion: {
		key: 'ArrowDown',
		name: 'full screen champion',
		label: 'full screen the champion',
		section: 'battle',
		hold: true
	},
	zoom: { key: 'Z', name: 'zoom', label: 'full-res zoom · mouse pans both panes', section: 'battle' },
	keep: {
		key: 'Space',
		name: 'keep',
		label: 'keep · held up full screen: it wins',
		section: 'singles'
	},
	cull: {
		key: 'X',
		name: 'cull',
		label: 'cull · held up full screen: it loses · group summary: cull the last one standing too',
		section: 'singles'
	},
	reel: {
		key: 'S',
		name: 'add to reel',
		label: 'add challenger to reel (stitched on commit)',
		section: 'video groups'
	},
	mute: { key: 'M', name: 'mute', label: 'mute / unmute', section: 'video groups' },
	trip: { key: 'T', name: 'random trip', label: 'random trip (also what the app opens on)', section: 'picker' },
	unreviewed: { key: '1', name: 'unreviewed', label: 'unreviewed', section: 'picker' },
	newSince: { key: '2', name: 'new since last cull', label: 'new since last cull', section: 'picker' },
	pickAlbum: { key: '3', name: 'pick an album', label: 'one album', section: 'picker' },
	range: { key: '4', name: 'date range', label: 'date range', section: 'picker' },
	duplicates: { key: '5', name: 'duplicates', label: 'duplicates', section: 'picker' },
	settings: { key: ',', name: 'settings', label: 'settings', section: 'picker' },
	confirm: {
		key: 'Enter',
		name: 'confirm',
		label: 'confirm · next group · commit · another trip',
		section: 'everywhere'
	},
	pickSession: { key: 'R', name: 'pick a session', label: 'done screen: pick a session', section: 'everywhere' }
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
const STORAGE = 'focull.keys';

/** How a key reads on screen: "B", "←", "↵", "space", "Ctrl+K". */
export const keyLabel = (key: Hotkey): string => formatForDisplay(key).replace('␣', 'space');

/**
 * The live key bindings: defaults plus this device's overrides (localStorage), and the
 * recorder that captures a new key for one action at a time.
 */
class Keymap {
	#custom = $state<Partial<Record<Action, Hotkey>>>(load());
	/** The action waiting for its new key. */
	recording = $state<Action | null>(null);
	/** Shift was down for the shift-click that started recording, and hasn't been let go yet. */
	#clickShift = false;
	#listeners: AbortController | null = null;
	#recorder = new HotkeyRecorder({
		onRecord: (key) => this.#recorded(key),
		onCancel: () => this.#stop()
	});

	of = (action: Action): Hotkey => this.#custom[action] ?? ACTIONS[action].key;
	isCustom = (action: Action): boolean => this.#custom[action] !== undefined;
	get anyCustom(): boolean {
		return ACTION_IDS.some(this.isCustom);
	}

	/** Wait for the next key press and bind it to `action`. Esc, or a click anywhere, cancels. */
	record = (action: Action, shiftHeld = false): void => {
		this.#stop();
		this.recording = action;
		this.#clickShift = shiftHeld;
		this.#listeners = new AbortController();
		const { signal } = this.#listeners;
		window.addEventListener('pointerdown', this.#stop, { capture: true, signal });
		window.addEventListener('keyup', (e) => e.key === 'Shift' && (this.#clickShift = false), { signal });
		this.#recorder.start();
		notify(`press a new key for ${ACTIONS[action].name} — esc cancels`, false, 5000);
	};

	reset = (action: Action): void => this.#bind(action, ACTIONS[action].key);

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
		const action = this.recording;
		const clickShift = this.#clickShift;
		this.#stop();
		// Backspace/Delete come through as '' — unbinding isn't a thing here, so keep the old key.
		if (!action || recorded === '') return;
		const key = clickShift ? withoutShift(recorded) : recorded;
		if (RESERVED.has(key)) {
			notify(`${keyLabel(key)} is reserved — ${ACTIONS[action].name} keeps ${keyLabel(this.of(action))}`, true);
			return;
		}
		this.#bind(action, key);
	}

	/** Give `action` the key; whichever action had it takes `action`'s old key, so nothing ever clashes. */
	#bind(action: Action, key: Hotkey): void {
		const old = this.of(action);
		if (key === old) return;
		const taken = ACTION_IDS.find((a) => a !== action && this.of(a) === key);
		this.#save({ ...this.#custom, [action]: key, ...(taken && { [taken]: old }) });
		const swap = taken ? ` · ${ACTIONS[taken].name} moved to ${keyLabel(old)}` : '';
		notify(`${ACTIONS[action].name} → ${keyLabel(key)}${swap}`, false, 3000);
	}

	/** Store only what differs from the defaults, so improved defaults still reach untouched keys. */
	#save(next: Partial<Record<Action, Hotkey>>): void {
		const custom: Partial<Record<Action, Hotkey>> = {};
		for (const a of ACTION_IDS) {
			const key = next[a];
			if (key && key !== ACTIONS[a].key) custom[a] = key;
		}
		this.#custom = custom;
		localStorage.setItem(STORAGE, JSON.stringify(custom));
	}
}

function load(): Partial<Record<Action, Hotkey>> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
		if (!raw || typeof raw !== 'object') return {};
		const stored = new Map(Object.entries(raw));
		const custom: Partial<Record<Action, Hotkey>> = {};
		for (const a of ACTION_IDS) {
			const key = stored.get(a);
			if (isHotkey(key)) custom[a] = key;
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

/**
 * Run `callback` on the action's current key, following rebinds live. Several screens can
 * register one action (each gating itself with `enabled`), so overlaps are expected.
 */
export function onKey(
	action: Action,
	callback: HotkeyCallback,
	options: CreateHotkeyOptions | (() => CreateHotkeyOptions) = {}
): void {
	createHotkey(
		() => keys.of(action),
		callback,
		() => ({ conflictBehavior: 'allow', ...(typeof options === 'function' ? options() : options) })
	);
}

/** Shift-click records a new key for `action` instead of clicking the element. */
export const rebindable =
	(action: Action): Attachment<HTMLElement> =>
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
				keys.record(action, true);
			},
			{ capture: true, signal }
		);
		return () => {
			listeners.abort();
			node.title = title;
		};
	};
