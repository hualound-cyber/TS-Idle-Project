# TS Legends — Idle RPG

Cross-Platform Chinese Fantasy Idle Turn-Based RPG inspired by TS Online.

## Architecture
- **Frontend (`apps/web`):** React 18, TypeScript, Vite, Tailwind CSS, HTML5 2D Battle Canvas, Socket.IO Client
- **Backend (`apps/api`):** Node.js 22, NestJS, PostgreSQL 16, Redis 7, Socket.IO WebSocket
- **Shared Engine (`packages/game-core`):** Pure TypeScript Stat Scaling (9 stats), Element Matrix, Idle Progression, Deterministic Turn-Based Auto Battle
- **Database (`db/migrations/001_init.sql`):** 33-table PostgreSQL schema seeded with 429 Warlords (1,139 evolution forms), 149 Skills, 8 World Map Zones, Monsters, Items, Equipment, and Quests

## Quick Start

```bash
# 1. Start PostgreSQL & Redis
docker compose up -d

# 2. Apply schema & seed data
docker exec -i ts_legends_pg psql -U tslegends -d tslegends < db/migrations/001_init.sql
python3 scripts/etl/seed_db.py

# 3. Install & build
pnpm install
pnpm -r build

# 4. Run tests
pnpm --filter @ts-legends/game-core test

# 5. Start API & Web
node apps/api/dist/main.js &
pnpm --filter @ts-legends/web dev
```

## Documentation
- Phase 1 Source Audit & Reports: `docs/phase1/`
- Phase 2 Game Design Document: `docs/phase2/GAME_DESIGN_DOCUMENT.md`
- Phase 8 Test & Completion Report: `docs/phase8/TEST_AND_COMPLETION_REPORT.md`
