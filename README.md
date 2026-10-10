# Kachuful

Online multiplayer Kachuful (also called Kachufool or Judgement), the Indian trick-taking game where you bid the exact number of tricks you will win. Works on phones and laptops, with friends or bots.

- **Web:** React + TypeScript (Vite), Tailwind CSS v4, Motion (the Framer Motion library, now published as `motion`). Deploys to **Vercel**.
- **Server:** Node.js + TypeScript + Socket.IO, server-authoritative. Deploys to **Render**.
- **Shared:** a pure TypeScript rules engine, bot heuristics and the typed socket protocol, used by both sides.
- **Tests:** Vitest. The server tests play complete 1-deck and 2-deck games over real sockets.

```
apps/
  server/            Socket.IO game server
    src/config.ts    env parsing, timings, CORS origin matcher
    src/room.ts      lobby + game driver (timers, bots, reconnect, views)
    src/socket.ts    event wiring, validation, rate limit, room sweeper
    src/roomStore.ts storage boundary (in-memory now; Redis later)
    src/app.ts       HTTP server, /health, Socket.IO setup
  web/               React client
    src/net/         socket, session storage, app store, wake-up logic
    src/screens/     Home, Lobby, Game, GameOver, WakingServer
    src/components/  cards, hand, seats, trick, bidding, scoreboard, modals
packages/
  shared/            rules engine (no I/O), engine state machine, bot, protocol types
```

## Hosting

The plan asked for Vercel (web) + Render (server), and that is what this repo is set up for. Trade-offs, briefly:

| Option | Pros | Cons |
| --- | --- | --- |
| **Render free** (default) | Simple, real Node process, WebSockets work | Sleeps after ~15 idle minutes; cold start ~30-60 s. Handled by the "Waking up the server" screen and keep-alive pings |
| Render Starter (~$7/mo) | No sleep, same setup | Paid |
| Fly.io / Railway | Always-on small VMs, regions near India | Paid beyond trial credits; similar setup to Render |
| Cloudflare Workers + Durable Objects | No cold start, one object per room, free tier | Server code must move to the Workers runtime (the room/engine logic ports as is, the socket layer does not) |
| Colyseus / PartyKit | Room abstractions built in | More framework lock-in than this game needs |

The engine and room logic are transport-independent, so moving to Durable Objects or adding Redis later is a contained change.

## Run the server from your laptop (server.exe)

Instead of Render, you can host the web app on Vercel and run the game server on your own machine.

1. Build it once: `pnpm build:exe`. This writes `apps/server/dist-exe/server.exe` (or download it from GitHub Releases).
2. Double-click `server.exe`. On first run it downloads `cloudflared.exe` next to itself and opens a free Cloudflare quick tunnel.
3. It prints a link like `https://your-app.vercel.app/?server=https://xxxx.trycloudflare.com` and copies it to the clipboard. Send that link to players. The tunnel address changes every run, so share the new link each time.

The web address comes from `--web https://your-app.vercel.app`, the `WEB_URL` variable, or a one-line `web-url.txt` next to the exe. Without it the exe prints only the server address, which you can paste into the **Server** link on the Vercel home screen. Other flags: `--no-tunnel` (this machine only) and `--port 3002`. When `CLIENT_ORIGINS` is not set the exe accepts any web origin.

## How it works

### Game state machine

```
LOBBY --start--> BIDDING --all bids--> PLAYING --last trick collected--> ROUND_SCORE
                    ^                    |  (trick complete -> pause -> collect, winner leads)
                    |                    |
                    +----- next deal ----+--- ROUND_SCORE --after final round--> GAME_OVER --play again--> LOBBY
```

- `LOBBY` lives in the server room. `BIDDING`, `PLAYING`, `ROUND_SCORE` and `GAME_OVER` are the pure engine (`packages/shared/src/engine.ts`). Every transition returns a new state and is unit-tested.
- A finished trick stays on the table (`completedTrick`) for `TRICK_PAUSE_MS` before it is collected, so everyone sees who took it.
- The round summary auto-advances after `ROUND_SUMMARY_MS`, or as soon as every connected player presses **Next round**.

### Socket events

Client to server (all with an ack `{ ok: true, data } | { ok: false, code, message }`):

| Event | Payload | Notes |
| --- | --- | --- |
| `room:create` | `{ name }` | returns `{ code, playerId, token }` |
| `room:join` | `{ code, name }` | lobby only |
| `room:resume` | `{ code, playerId, token }` | reclaims your seat after a refresh or drop |
| `room:leave` | – | in the lobby: removed; mid-game: a bot takes the seat |
| `lobby:settings` | `{ decks?, tieBreak?, turnSeconds? }` | host only; changing decks resets everyone's ready flag |
| `lobby:ready` | `{ ready }` | |
| `lobby:kick` | `{ playerId }` | host only |
| `lobby:addBot` | – | host only |
| `lobby:start` | – | host only, 3-10 players, all humans ready |
| `game:bid` | `{ bid, actionId }` | `actionId` makes retries idempotent |
| `game:play` | `{ cardId, actionId }` | |
| `game:continue` | – | vote to skip the round summary |
| `player:back` | – | turn off auto-play after a timeout |
| `room:playAgain` | – | host, after game over |

Server to client: `room:state` (a per-player `RoomSnapshot` with a monotonic `version`), `room:kicked`, `room:notice`.

**Hidden information:** a snapshot carries public state plus *only your own* hand, legal card ids and allowed bids. Other hands never leave the server; an integration test checks every snapshot of a full game for this.

### Rules decisions and assumptions

- **Seats and turn order:** seat order is join order; play goes to increasing seat numbers ("to the left"). The round-1 dealer is chosen at random, then the deal rotates one seat left each round. The player left of the dealer bids first and leads trick 1.
- **Rounds:** `floor(52 × decks / players)`. Undealt cards just stay in the shoe; the lobby warns about them and about games over 15 rounds.
- **Trick winner, third tier:** "highest of the other suits" can never win, because the leader's card always belongs to the lead suit (or trump). It is implemented anyway so the comparison is total.
- **Tie rule (2 decks):** identical suit and rank: the card played *later* wins. This applies within the trump and lead-suit tiers. An identical off-suit discard still loses to the lead suit.
- **Last-bidder restriction:** the dealer cannot bid `r - (sum of other bids)` when that number is within `0..r`. If the others already bid more than `r`, there is no restriction. Since `0..r` always has at least two numbers, a legal bid always exists. The defined fallback, lifting the restriction if none were left, is coded and tested but can't occur with these rules.
- **Scoring:** exact bid gives `bid × 11`; an exact 0 gives 10; a miss gives 0.
- **Final ties:** the host picks either "Most exact bids wins" (default; still-equal players share) or "Shared win".
- **Ready rule:** the host is implicitly ready; bots are always ready.
- **Joining mid-game is not allowed**; you can only resume your own seat.
- **Leaving / kicking mid-game** turns the seat into a bot, so the game always finishes. Bots cannot be removed mid-game.
- **Host leaves:** the host role passes to the next human. If no humans remain, the room closes.
- **AFK and disconnects:** if the turn timer runs out, the move is auto-played and the player is marked *away*, so later turns auto-play quickly until they act or press **I'm back**. A disconnected player's turn waits `DISCONNECT_GRACE_MS` (for a quick refresh) and is then auto-played. If *no* human is connected, the room pauses instead of letting bots finish alone.
- **Duplicate / simultaneous / out-of-turn intents:** Node handles each room's events one at a time. Each intent is validated against the current state (turn, phase, hand, follow-suit, forbidden bid), and repeated `actionId`s return the cached ack. The client also blocks a second intent while one is in flight.
- **Shuffle:** Fisher-Yates over `crypto.getRandomValues`, with rejection sampling, so there is no modulo bias.
- **Room cleanup:** rooms with no connected human for `ROOM_IDLE_TTL_MS` (15 min) are deleted. Lobby members offline for `LOBBY_GHOST_MS` (90 s) are dropped from the lobby.

## Run locally

Requires Node 20.11+ (22 recommended) and pnpm 10 (`corepack enable`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env         # VITE_SERVER_URL=http://localhost:3001 (also the default)
pnpm dev                                       # server on :3001, web on :5173
```

Open http://localhost:5173. To try multiplayer on one machine, use a normal window plus a private window (each needs its own localStorage seat). For phones on the same Wi-Fi, open `http://<your-LAN-IP>:5173`. In that case set `VITE_SERVER_URL=http://<your-LAN-IP>:3001` and add the origin to `CLIENT_ORIGINS`.

The server reads `process.env` only (`apps/server/.env.example` lists the variables). Export them or prefix the command, e.g. `CLIENT_ORIGINS=http://192.168.1.20:5173 pnpm dev:server`.

```bash
pnpm test        # all Vitest suites (rules, engine, bots, room timers, socket integration, hand layout)
pnpm typecheck
pnpm build       # server bundle -> apps/server/dist, web -> apps/web/dist
```

## Deploy

### 1. Server on Render

1. Push this repo to GitHub.
2. Render Dashboard -> **New -> Blueprint**, pick the repo. `render.yaml` creates `kachuful-server`: free plan, Singapore region, health check `/health`.
   - Manual alternative: **New -> Web Service**, Runtime Node, Root Directory blank.
     - Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @kachuful/server build`
     - Start: `node apps/server/dist/index.js`
     - Health check path: `/health`
3. Set the environment variable `CLIENT_ORIGINS` to your Vercel URL(s). Wildcards cover preview deployments, e.g. `https://kachuful.vercel.app,https://kachuful-*.vercel.app`.
4. Deploy, then check `https://<service>.onrender.com/health` returns `{"ok":true,...}`.

### 2. Web on Vercel

1. Vercel -> **Add New -> Project**, import the repo.
2. **Root Directory:** `apps/web`. Framework preset: Vite. `apps/web/vercel.json` sets the build command, `dist` output and the SPA rewrite that makes `/r/CODE` links work.
3. Environment variable: `VITE_SERVER_URL=https://<service>.onrender.com` (no trailing slash), for Production and Preview.
4. Deploy. If the Vercel URL differs from what you put in `CLIENT_ORIGINS`, update it on Render and redeploy the server.

### Environment variables

| Where | Variable | Default | Purpose |
| --- | --- | --- | --- |
| Render | `CLIENT_ORIGINS` | `http://localhost:5173` | Allowed browser origins (comma-separated, `*` wildcard per label) |
| Render | `PORT` | set by Render | Listen port |
| Render (optional) | `BOT_DELAY_MIN_MS` / `BOT_DELAY_MAX_MS` | 700 / 1300 | Bot "thinking" time |
| Render (optional) | `TRICK_PAUSE_MS` | 1600 | Completed trick stays visible |
| Render (optional) | `ROUND_SUMMARY_MS` | 9000 | Round summary duration |
| Render (optional) | `DISCONNECT_GRACE_MS` | 10000 | Wait before auto-playing for a dropped player |
| Render (optional) | `AWAY_DELAY_MS` | 1200 | Auto-play delay for away players |
| Render (optional) | `ROOM_IDLE_TTL_MS` / `LOBBY_GHOST_MS` | 900000 / 90000 | Cleanup |
| Render (optional) | `RATE_LIMIT_BURST` / `RATE_LIMIT_PER_SEC` | 20 / 10 | Per-socket event limit |
| Vercel | `VITE_SERVER_URL` | `http://localhost:3001` | Render URL |

### Cold starts and keep-alive

The free Render instance sleeps after about 15 idle minutes. The web app handles this in three ways:

- **Wake-up screen:** it pings `/health` on load, and after 1.5 s without an answer it shows a "Waking up the game server" screen with elapsed time. It gives up with a retry button after 2 minutes.
- **Keep-alive:** while you are in a room, it pings `/health` every 4 minutes, so a game doesn't idle out.
- **Optional:** to keep the server warm between games, point a free uptime monitor (e.g. UptimeRobot or cron-job.org) at `/health` every 10 minutes. One always-on free service uses about 744 of Render's 750 free instance-hours per month. Rooms live in memory, so a restart or redeploy ends any game in progress.

## Manual test checklist (4 players)

Use 4 devices: ideally 2 phones (one portrait, one landscape) and 2 laptops.

**Lobby**
- [ ] Host creates a room; the code and **Invite** link (share sheet on phones, copied on desktop) work. A friend opening the link lands on the join form with the code filled in.
- [ ] Three others join; names are listed in seat order. A duplicate name gets " 2".
- [ ] Host toggles 1 deck / 2 decks: everyone sees it change read-only, the round count updates live (13 or 26), and non-hosts get a toast and must press **I'm ready** again.
- [ ] The long-game warning shows for 2 decks. With 5 players, the unused-cards warning shows (2 cards for 1 deck).
- [ ] **Start** is disabled until everyone is ready, with the reason shown. Host can kick a player, and the kicked player returns to home with a message.

**1-deck game (13 rounds)**
- [ ] Round 1: 1 card each, trump ♠ Spades (Kadi) shown in the top bar. The player left of the dealer (D badge) bids first.
- [ ] Bidding: buttons 0..r. Only the dealer sees the forbidden number struck through and disabled, with the explanation. Bids appear live on the seat chips.
- [ ] Playing: only legal cards are bright. Tapping an illegal card does nothing. Tap a card to select, then **Play** (or tap it again). The lead suit badge appears after the first card.
- [ ] Trump beats the lead suit; the winner's card is ringed, "X takes the trick" shows, and the winner leads next.
- [ ] Round summary shows bid / won / points (exact bid = bid × 11, exact 0 = 10, miss = 0). **Next round** from everyone skips the countdown.
- [ ] Trump cycles ♠ ♦ ♣ ♥ and the dealer moves left each round.
- [ ] **Last trick**, **Scoreboard** (phones) / sidebar (laptops), **How to play** (mentions deck count and tie rule), and the sound toggle all work.
- [ ] Refresh a phone mid-trick: it comes back to the same seat with the same cards and scores.
- [ ] Turn a laptop's Wi-Fi off on their turn: within about 30 s (20 s heartbeat timeout + 10 s grace) the others see "Offline · auto-play" and the turn is auto-played (the turn timer may fire first). Turning Wi-Fi back on restores the seat.
- [ ] Let the turn timer run out: the move is auto-played, the "Auto-play is covering your turns" banner appears, and **I'm back** clears it.
- [ ] After round 13, the final standings show the winner (or "=1st" for a tie, per the chosen tie-break), with **Play again** for the host.

**2-deck game (26 rounds)**
- [ ] Host clicks **Play again**, picks 2 decks, starts. Shows Round x/26.
- [ ] Hands above ~13 cards fan in one row on laptops and split into two rows on a 360 px phone; all cards stay tappable.
- [ ] When two identical cards land in one trick (e.g. both A♠), the later one wins.
- [ ] One player taps **Leave** mid-game: their seat becomes "Name (bot)" and the game continues to round 26.

**Solo**
- [ ] One player adds 3 bots and plays a full game alone.

## Agent skills

Project skills live in `.claude/skills/`. Registry skills are pinned in `skills-lock.json`; restore them with:

```bash
npx skills experimental_install
```
