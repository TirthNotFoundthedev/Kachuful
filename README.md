# Kachuful

Online multiplayer **Kachuful** (also called Kachufool or Judgement), the Indian trick-taking card game where you bid the exact number of tricks you will win. Not one more, not one less.

Play with friends on phones and laptops, or fill the table with bots. Up to 10 players, one or two decks.

## Screenshots

| Home | Lobby | Bidding |
| --- | --- | --- |
| ![Home](docs/screenshots/home.png) | ![Lobby](docs/screenshots/lobby.png) | ![Bidding](docs/screenshots/bidding.png) |

| Playing a trick | Scoreboard | Round summary |
| --- | --- | --- |
| ![Playing](docs/screenshots/playing.png) | ![Scoreboard](docs/screenshots/scoreboard.png) | ![Round summary](docs/screenshots/round-summary.png) |

## How to play

1. Each round, every player is dealt cards: 1 card in round 1, 2 in round 2, and so on. The trump suit changes every round (♠ ♦ ♣ ♥).
2. Starting left of the dealer, everyone bids how many tricks they expect to win. The dealer cannot bid a number that would make the total bids equal the number of tricks.
3. Play the tricks. Follow the lead suit if you can. Trump beats the lead suit; the highest card wins.
4. Score: an exact bid gives **bid × 11** points, an exact **0** gives **10**, and a miss gives **0**.
5. After the last round, the highest total wins. The in-game **How to play** button shows the full rules.

## Play

You do not install anything to play. Someone hosts a table (see below) and sends you a link. Open it on your phone or laptop, type a name, and you are in. Tap **Invite** in the lobby to share the link for your table.

## Host a game with server.exe (Windows)

The game website is hosted on Vercel at **https://kachuphul-bytirth.vercel.app**. The game server runs on your own laptop through `server.exe`, so there is nothing to deploy and nothing to pay for.

### 1. Download

Get `server.exe` from the [latest release](https://github.com/TirthNotFoundthedev/Kachuful/releases/latest). Put it in its own folder, for example `C:\Kachuful`.

### 2. Run

Double-click `server.exe`.

- Windows SmartScreen may warn about an unsigned app. Click **More info**, then **Run anyway**.
- If Windows Firewall asks, you can click **Cancel**. The tunnel connects to the server from the same machine, so no inbound access is needed.
- The first run downloads `cloudflared.exe` (about 60 MB) into the same folder. This is the free Cloudflare tunnel that makes your laptop reachable from the internet.

### 3. Share the link

After a few seconds the window prints something like:

```
Server address: https://some-words.trycloudflare.com

Share this link with players (copied to clipboard):

  https://kachuphul-bytirth.vercel.app/?server=https%3A%2F%2Fsome-words.trycloudflare.com
```

The link is already on your clipboard. Send it to your friends, open it yourself, create a room, and add bots or wait for friends to join.

### Good to know

- Keep the `server.exe` window open while you play. Closing it stops the game.
- The tunnel address changes every time you start `server.exe`, so share the new link each time.
- Rooms live in memory. If the server restarts, games in progress end.
- The server needs an internet connection and about 100 MB of free disk space.

### Options

| Flag | What it does |
| --- | --- |
| `--no-tunnel` | Local only, no tunnel. Players on this machine can connect. |
| `--port 3002` | Use another port if 3001 is busy. |
| `--web https://other.example` | Use a different web app address. Also settable with the `WEB_URL` variable or a one-line `web-url.txt` next to the exe. |

Run from a terminal to pass flags, for example `.\server.exe --port 3002`.

### If a friend cannot connect

- Check they used your newest link, not one from an earlier run.
- On the home screen, **Server** shows which game server the page is connected to. You can paste a server address there.
- If the window says it could not open a tunnel, check your internet connection and run `server.exe` again.

## Run from source

For development or to build `server.exe` yourself.

**Requirements:** Node 20.11 or newer (22 recommended) and pnpm 10 (`corepack enable`, or `npm install -g pnpm`).

```bash
git clone https://github.com/TirthNotFoundthedev/Kachuful.git
cd Kachuful
pnpm install
pnpm dev
```

This starts the server on http://localhost:3001 and the web app on http://localhost:5173. Open the web address in a browser. To try multiplayer on one machine, use a normal window plus a private window, since each needs its own saved seat.

Other commands:

```bash
pnpm test         # all unit and integration tests
pnpm typecheck
pnpm build        # server bundle and web build
pnpm build:exe    # builds apps/server/dist-exe/server.exe
```

Quickest way to try it alone: create a room, click **Add a bot** three times, and press **Start game**.

## Documentation

The [development guide](docs/DEVELOPMENT.md) covers the game state machine, socket events, every rules decision, environment variables, deploying to Render and Vercel, and the manual test checklist.

## Built with

- **Web:** React + TypeScript (Vite), Tailwind CSS v4, Motion. Deployed on Vercel.
- **Server:** Node.js + TypeScript + Socket.IO, server-authoritative. Runs as `server.exe` or on Render.
- **Shared:** a pure TypeScript rules engine, bot logic and the typed socket protocol, used by both sides.
- **Tests:** Vitest. The server tests play complete 1-deck and 2-deck games over real sockets.

## Agent skills

Project skills live in `.claude/skills/`. Registry skills are pinned in `skills-lock.json`; restore them with:

```bash
npx skills experimental_install
```
