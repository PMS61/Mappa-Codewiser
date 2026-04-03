# Mappa Codewiser

Axiom is a cognitive-aware task scheduling app built with Next.js. Instead of treating every hour equally, it schedules tasks based on cognitive load, section budgets (morning/afternoon/evening), and deadline pressure, then explains every scheduling decision in a visible reasoning chain.

## What this project does

- Converts tasks into deterministic scheduling units (with explicit cost formulas).
- Splits larger tasks into chunks and allocates them across multiple days.
- Uses section-based "Axiom" budgets to avoid overload and improve pacing.
- Learns section weight adjustments over time from completion efficiency feedback.
- Supports onboarding-based personalization (wake/sleep, focus windows, low-energy windows, fixed commitments, recovery activities).
- Includes a report workflow for baseline vs observed behavior tracking.
- Supports RAG-style syllabus/content ingestion to generate structured study tasks.

## Feature highlights

### 1. Deterministic scheduling engine (no black-box planner)

The core scheduler in `client/src/lib/scheduler.ts` runs a strict pipeline:

1. Score tasks
2. Sort by score
3. Apply anti-starvation ordering
4. Chunk long tasks
5. Allocate to sections/day offsets
6. Check constraints/diversity
7. Return schedule + reasoning log

Axiom model constants and formulas are implemented in `client/src/lib/energyModel.ts`, including:

- Daily base budget (`BASE_AXIOMS = 50`)
- Section weight normalization
- Cost and gain formulas
- Feedback-driven section weight updates

### 2. Reasoning chain and transparent decisions

The UI exposes the scheduling trace through a dedicated reasoning panel, so users can inspect why tasks were placed, deferred, chunked, or left unscheduled.

### 3. Section-aware capacity planning

Schedules are structured by day sections:

- Morning
- Afternoon
- Evening

Each section has a budget and tracked usage, helping prevent overload concentration in a single period.

### 4. Task lifecycle + persistence

Server actions persist users, tasks, chunks, schedules, section weights, and task events in Postgres via `@vercel/postgres`.

### 5. Onboarding and profile-driven behavior

Onboarding captures user rhythm and constraints, then stores profile data that the scheduler and reports consume.

### 6. Reporting and observation data model

The report system stores baseline profile assumptions and daily observations to support behavior-deviation analysis and progressive tuning.

### 7. RAG-assisted task generation

The app includes text/PDF extraction and topic parsing, plus embedding/retrieval utilities to transform source materials into schedulable tasks.

## Tech stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Vercel Postgres (`@vercel/postgres`)
- JWT auth (`jsonwebtoken`) + password hashing (`bcrypt`)
- Drag-and-drop interactions (`@dnd-kit/core`)
- Document processing and extraction:
  - `pdfjs-dist`
  - `tesseract.js`
  - `@xenova/transformers`
- Biome for lint/format

## Main routes

- `/` landing page
- `/login` login flow
- `/onboarding` onboarding flow
- `/dashboard` scheduler dashboard
- `/dashboard/tasks` task management and matrix-oriented planning
- `/dashboard/report` report view
- `/dashboard/profile` profile view
- `/dashboard/tutorial` tutorial view
- `/dashboard/feedback` feedback updates view

## Repository structure

```text
Mappa-Codewiser/
  client/                  # Next.js application
    src/
      app/                 # App Router pages + server actions
      components/          # UI and visualization components
      lib/                 # Scheduling engine, scoring, constraints, RAG utils
```

## Getting started

### Prerequisites

- Node.js 20+
- npm (or compatible package manager)
- A Postgres database reachable by `@vercel/postgres` environment variables

### 1) Install dependencies

```bash
cd client
npm install
```

### 2) Configure environment

Create `client/.env.local` with at least:

```env
JWT_SECRET=replace_with_a_long_random_secret
# Plus Postgres variables required by @vercel/postgres
# (for example: POSTGRES_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING,
# POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE, POSTGRES_HOST)
```

### 3) Run development server

```bash
npm run dev
```

Open http://localhost:3000.

## Available scripts (from `client/package.json`)

```bash
npm run dev      # Next.js dev server (webpack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Biome check
npm run format   # Biome format --write
```

## Current implementation notes

- The deterministic scheduler and persistence pipeline are implemented and wired to the dashboard flow.
- Report and observation tables are implemented and support baseline/metric storage.
- Some conceptual product ideas in planning docs may be ahead of currently shipped UI behavior; this README describes the implemented code paths in the current repository.

## License

No license file is currently present in this repository root. Add one if you plan to open-source or distribute commercially.
