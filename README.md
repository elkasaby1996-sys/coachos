# CoachOS

CoachOS is a web-first SaaS prototype for personal trainers and clients. The app includes a PT workspace with dashboards, templates, and client management, plus a mobile-friendly client portal.

## Tech Stack
- Vite + React + TypeScript
- TailwindCSS + shadcn/ui patterns
- React Router
- Supabase (auth + postgres + storage)
- TanStack Query
- Recharts
- react-hook-form + zod

## Getting Started

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment variables
Create a `.env` file in the project root:
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3) Run the dev server
```bash
npm run dev
```

## Demo seed helpers
A lightweight seed helper script is included in `src/lib/seed.ts` with example data structures to guide your Supabase seeding workflow.

## Scripts
- `npm run dev` - start the dev server
- `npm run build` - typecheck + build
- `npm run preview` - preview production build
