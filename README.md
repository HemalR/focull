# focull

**focus + cull** — a keyboard-centric, desktop-focused culling app for [Immich](https://immich.app). People take too many photos; focull makes getting down to the good ones fast, and does it without ever deleting anything by default.

## How it works

focull detects bursts and event clusters in your library (time-window grouping), then runs each group as a **battle royale**: the current best photo — the *champion* — sits large on the left, each remaining shot appears as a *challenger* on the right, and one keystroke decides every duel. The last one standing wins.

Nothing touches your library until you review and **commit**, at which point focull writes the results back to Immich:

- Culled assets are **tagged `foculled`** (default; archive or trash are opt-in settings) and **stacked behind the winner**, so your timeline instantly shows only keepers while every original survives.
- The winner becomes the Immich **stack primary**.
- For video clusters you can mark clips for a **reel**: focull losslessly concatenates them with ffmpeg (stream copy — no re-encode, no quality loss), uploads the stitched video to Immich, and stacks the source clips beneath it. Mixed-format clips are refused rather than silently transcoded.

## Keyboard

| Key | Action |
|---|---|
| `←` (or click champion) | Champion stays — challenger is culled |
| `→` (or click challenger) | Challenger wins — takes the crown, old champion is culled |
| `B` | Both survive (two genuinely different keepers in one burst) |
| `S` | Add clip to the stitch reel (video groups) |
| `U` | Undo last decision |
| `Z` | 2× zoom on both panes (sharpness check) |
| `Space` / `X` | Keep / cull (single-asset groups) |
| `Enter` | Advance (next group, review, commit) |
| `Esc` | Back to the session picker |

Click any undecided thumbnail in the carousel to make it the next challenger.

## Running it

### Docker (recommended)

```yaml
services:
  focull:
    image: focull # build from this repo: docker build -t focull .
    ports:
      - '3000:3000'
    environment:
      IMMICH_URL: http://immich-server:2283
      # IMMICH_API_KEY: xxxx   # optional — skips the login screen
```

Open `http://localhost:3000`, paste an Immich API key (Immich → Account Settings → API Keys), and start culling. The key is validated against Immich and stored in an httpOnly cookie; all Immich traffic flows through focull's same-origin proxy, so no CORS configuration is needed.

### Development

```sh
npm install
IMMICH_URL=http://your-immich:2283 npm run dev
```

`ffmpeg`/`ffprobe` on the PATH enable video stitching (`FFMPEG_PATH`/`FFPROBE_PATH` to override); without them, focull hides the reel feature and everything else works.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `IMMICH_URL` | yes | Base URL of your Immich server |
| `IMMICH_API_KEY` | no | Zero-login mode for single-user setups |
| `FFMPEG_PATH` / `FFPROBE_PATH` | no | Override ffmpeg binaries |

## Sessions

Start from **new since your last cull** (focull remembers a high-water mark), an **album**, or a **date range**. Burst detection uses an 8-second gap for photos and a 10-minute gap between clips for videos — both configurable in settings (`,`). Progress is saved locally as you go; an interrupted session offers to resume.

## Safety model

focull is deliberately chicken-hearted with your memories:

- Default reject action is a **tag** — fully reversible, nothing leaves your library.
- **Archive** and **trash** are available in settings; trash still goes through Immich's trash with its retention window.
- Every change is staged locally and applied only at commit, after a review screen that spells out exactly what will happen.
- Stitching is lossless stream copy only; source clips are stacked, never removed.

## Roadmap

- User-remappable keybindings (TanStack Hotkeys ships a recorder — the plumbing is there)
- Visual-similarity grouping via Immich smart search, beyond time windows
- `J`/`K`/`L` shuttle and frame stepping for video duels
- Rating (`1–5`) passthrough to Immich's rating field

## License

TBD before publishing. Note that focull depends on `@immich/sdk`, which is AGPL-3.0 — an AGPL-3.0 license for this project is the path of least resistance.
