# Kachuful

A multiplayer web card game.

## Planned stack

- **Frontend:** React + Vite + Motion, hosted on Cloudflare Pages
- **Realtime:** Cloudflare Workers + Durable Objects (one object per game room, WebSockets)
- **Optional:** Supabase for accounts and leaderboards

Everything runs on free tiers.

## Agent skills

Project skills live in `.claude/skills/`. Registry skills are pinned in `skills-lock.json`; restore them with:

```bash
npx skills experimental_install
```
