# focull

**focus + cull** — a keyboard-centric, desktop-focused culling app for [Immich](https://immich.app). People take too many photos; focull makes getting down to the good ones fast, and does it without ever deleting anything by default.

## How it works

focull groups your library into scenes (photos taken within a few minutes of each other) and walks each scene as a stream of duels: the current best photo — the *champion* — sits large on the left, each next shot appears as a *challenger* on the right, and one keystroke decides every duel. Keep a decent shot and a better one turns up two frames later? It just takes the crown — no hunting back to delete the first.

Open the app and you land straight in a **random trip**: the scene of a random photo you've never judged, plus the few days after it. No picking, just culling — and a trip down memory lane.

Nothing touches your library until you review and **commit**, at which point focull writes the results back to Immich:

- Culled assets are **tagged `focull/culled`** (default; archive or trash are opt-in settings) and **stacked behind the keeper they lost to**, so your timeline instantly shows only keepers while every original survives. A group can also end with no survivors — culled shots are then tagged but left unstacked.
- Everything a committed session touched — winners included — is **tagged `focull/reviewed`**, so future sessions skip photos you've already judged. Untag an asset in Immich to send it back into the pool.
- The winner becomes the Immich **stack primary**.
- For video clusters you can mark clips for a **reel**: focull losslessly concatenates them with ffmpeg (stream copy — no re-encode, no quality loss), uploads the stitched video to Immich, and stacks the source clips beneath it. Mixed-format clips are refused rather than silently transcoded.

## Keyboard

| Key | Action |
|---|---|
| `←` (or click champion) | Champion stays — challenger is culled |
| `→` (or click challenger) | Challenger wins — takes the crown, old champion is culled |
| `B` | Keep both — the challenger becomes the one to beat for the shots that follow |
| `S` | Add clip to the stitch reel (video groups) |
| `A` | Stage the champion for an album (existing or created on the spot; applies at commit) |
| `G` | Skip this group — it stays unreviewed for a later session |
| `M` | Mute / unmute videos |
| `U` | Undo last decision |
| `Z` | Full-resolution zoom on both panes with synced panning (sharpness duel) |
| `Space` / `X` | Keep / cull (single-asset groups) |
| `Enter` | Advance (next group, review, commit; another trip when done) |
| `?` | Keyboard cheatsheet |
| `Esc` | Back to the session picker |

Click any undecided thumbnail in the carousel to make it the next challenger, and hover a photo pane for a magnifier loupe (toggleable in settings). On the review screen, click any judged thumbnail to change its fate before committing.

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

The app opens on a **random trip** (`T` in the picker for another). Or start from **unreviewed** (everything you've never judged — the reviewed tag is the source of truth, so this works across browsers and devices), **new since your last cull** (a faster date-based path), an **album**, a **date range**, or **duplicates** (Immich's visual duplicate groups, with the suggested keeper opening as champion). Photos chain into a scene while consecutive shots are within 5 minutes of each other; scenes longer than 40 photos split at their widest gaps. Videos cluster separately (10-minute gap between clips), so a clip never breaks up a run of photos. Both gaps are configurable in settings (`,`). The grouping is generous on purpose: an unrelated photo in a scene costs one `B`, while a missed pairing costs the comparison. Progress is saved locally as you go; an interrupted session offers to resume.

## Safety model

focull is deliberately chicken-hearted with your memories:

- Default reject action is a **tag** — fully reversible, nothing leaves your library.
- **Archive** and **trash** are available in settings; trash still goes through Immich's trash with its retention window.
- Every change is staged locally and applied only at commit, after a review screen that spells out exactly what will happen.
- Stitching is lossless stream copy only; source clips are stacked, never removed.

## Updates

focull is versioned with semver; tagged releases publish multi-arch images to GHCR via CI. The app quietly checks GitHub releases (cached 6h) and shows a dismissible banner when a newer version exists — disable with `FOCULL_DISABLE_UPDATE_CHECK=1`. Watchtower/Renovate-style auto-updaters work as usual against the image tags. focull warns (without blocking) when your Immich server's major version differs from the one it was built against.

## Roadmap

- User-remappable keybindings (TanStack Hotkeys ships a recorder — the plumbing is there)
- Visual similarity to pick the most relevant earlier keeper as the one to beat (a scene that returns to an earlier subject)
- `J`/`K`/`L` shuttle and frame stepping for video duels
- Rating (`1–5`) passthrough to Immich's rating field
- Commit receipts with one-click undo of a whole commit

## License

TBD before publishing. Note that focull depends on `@immich/sdk`, which is AGPL-3.0 — an AGPL-3.0 license for this project is the path of least resistance.
