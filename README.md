# THE BIG CON — Desktop Build (with Discord Rich Presence)

This wraps the exact same `index.html` game in a small Electron app so it can
talk to your local Discord client and show a live status — what screen
you're on, whose turn it is, how close you are to the target, your chosen
character's portrait, and how many people are at the table (via Discord's
native party display) — on your Discord profile.

**The web version still works exactly as before.** `index.html` is unchanged
in how it plays; a handful of `Presence.xxx()` calls were added that check
for `window.discordRPC` and quietly do nothing if it isn't there. Open the
same file in a normal browser (or host it wherever you already do) and it
behaves identically, minus the Discord status.

## What shows up on Discord

| Screen | Details | State | Small image | Party | Join invite |
|---|---|---|---|---|---|
| Menu | "In the menu" | "Setting up the con" | — | — | — |
| Lobby | "Hosting a lobby" / "Waiting in a lobby" | "3/8 seated — send a Discord invite" | your picked character | 3 of 8 | yes, while seats are open |
| In game | "Turn 4 — Alex's move" | "$12 of $40 target" | your character | connected of 8 | — |
| Game over | "Game over" | "Alex pulled off the con" | winner's character | — | — |

The room **buzzword is no longer printed on your Discord profile**. Friends
join from the native Discord invite card (the same "Invite to join" / Join
button shown in the Developer Portal preview) instead of reading the code
off your status. The buzzword still works in the lobby, the website, and
the copy-code button — Discord is just another way in.

### Sending a Discord invite

Once you are in a lobby with open seats, Discord treats the activity as a
joinable party:

1. In any Discord chat or DM, hit the **+** next to the message box and
   pick the Play / invite-game action for **THE BIG CON**.
2. That posts the invite card (cover image + party slots + **Join**).
3. Friends who already have the desktop build click **Join**. Discord
   launches or focuses their app and drops them into the same PeerJS room.
4. Friends on the website type the buzzword as before.

"Ask to Join" on your profile is auto-accepted and turns into the same
invite. The Join button hides itself when the table is full (8/8) or once
the con has started.

The large image is always your `big_con_logo` asset. The invite card's
cover image is the **Rich Presence Invite Image** you upload in the
Developer Portal (`coverimage` in the assets list). The small image uses
whichever character portrait you picked — every character id in `CHARS`
maps to an asset key `<id>_big`. Party size uses Discord's built-in party
field, so it renders the same way any other game's "3 of 8 players" does.

Each player's own game window shows presence from **their own** point of
view (their own money, their own character, whether it's their turn) — it's
driven entirely by the shared game state your copy already receives over
PeerJS, so no extra game networking was added. The join secret is only the
room slug, handed to Discord so the other desktop client can call
`guestJoin` with it.

## One-time setup

1. **Install Node.js** (18+) if you don't have it.
2. **Create a Discord application** at
   https://discord.com/developers/applications → **New Application**.
   Name it whatever you like (e.g. "THE BIG CON").
3. On the app's **General Information** page, copy the **Application ID**.
   Paste it into `config.json` in this folder:
   ```json
   { "clientId": "PASTE_YOUR_APPLICATION_ID_HERE" }
   ```
4. Under **Rich Presence → Art Assets**, make sure you have `big_con_logo`
   uploaded (for the large image) plus one `<characterId>_big` asset per
   character (`markwatson_big`, `tomkins_big`, `jimchalmers_big`,
   `bessock_big`, `calvinathanasius_big`, `denialswan_big`, `japsnchen_big`,
   `thousandyardwax_big`) — if you've already added these in the Developer
   Portal (as in your screenshot), you're done, no code changes needed here.
5. Under **Rich Presence**, upload a **Cover Image** (the 1024×576 invite
   art). That is what Discord stamps onto the "Invite to join" card — it
   is separate from `big_con_logo`.
6. Make sure this folder also has the game's `static/` image folder and
   `favicon.ico` sitting next to `index.html` (they weren't part of the
   uploaded file, so copy them in from your existing web copy of the game).

## Running it

```bash
npm install
npm start
```

Discord must be running on the same machine for a status to appear. If it
isn't, the game still runs fine — it just retries quietly every 15 seconds
in case you open Discord later.

## Building a distributable app

```bash
npm run dist
```

This uses `electron-builder` to produce an installer/AppImage in `dist/`
(Windows `.exe`, macOS `.dmg`, or Linux `.AppImage` depending on the
platform you build on). You'll likely want to add a proper app icon — see
electron-builder's docs for `icon` paths per platform.

## Troubleshooting

- **No status showing at all** → check `config.json` has a real client ID,
  and that Discord is running *before* you launch the game (or wait ~15s
  after opening Discord for the retry to kick in).
- **Status is stuck on an old screen** → this only happens if the app
  crashes without reaching `window-all-closed`; just relaunch it.
- **Multiplayer** → networking (PeerJS) is completely unchanged. Discord
  Rich Presence is purely local: your `config.json` only controls *your
  own* Discord status. Each player who wants a status needs their own copy
  of this desktop build with their own `config.json` — but everyone can
  still play together fine if only some of them do.

## Files added for the desktop build

- `main.js` — Electron main process; owns the Discord IPC connection
  (via `@xhayper/discord-rpc`) and the app window.
- `preload.js` — exposes a tiny `window.discordRPC` API to the page.
- `config.json` — where your Discord Application ID goes.
- `package.json` — dependencies + `electron-builder` packaging config.
- `index.html` — your original game, with a small `Presence` helper added
  near the top of the script and a few one-line calls to it at the
  existing menu/lobby/render/win points.
