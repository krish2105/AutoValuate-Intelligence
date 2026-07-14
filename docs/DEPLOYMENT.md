# Deployment guide

Free-tier hosting map (Section 12). Everything in this repo is deploy-ready; the steps below
are the ones that need your platform logins. CI/CD workflows live in `.github/workflows/` and
each **skips gracefully** until its secrets exist, so nothing breaks before you configure it.

## Hosting map

| Component | Host | Tier | Deploys via |
|---|---|---|---|
| Frontend (Next.js) | Vercel | Hobby | `deploy-frontend.yml` or Vercel Git integration |
| Orchestration API | Render | Free web service | `deploy-backend.yml` (deploy hook) + `backend-api/render.yaml` |
| CV detector | Hugging Face Space | CPU Basic (Docker) | `deploy-cv-space.yml` (git push to Space) |
| DB + pgvector + Auth | Supabase | Free | schema + loader in `backend-api/agents/`, kept alive by `supabase-keepalive.yml` |
| Training | Kaggle | Free GPU | offline; weights exported to repo |

## One-time setup

### 1. GitHub repo secrets (Settings → Secrets and variables → Actions)
Add the ones you have; workflows skip any that are missing.

| Secret | Where to get it |
|---|---|
| `RENDER_DEPLOY_HOOK` | Render → service → Settings → Deploy Hook |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercel → Account → Tokens; `.vercel/project.json` after `vercel link` |
| `HF_TOKEN`, `HF_USERNAME`, `HF_SPACE` | HF → Settings → Access Tokens (write); your username; Space name (e.g. `autovaluate-cv`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |

### 2. Hugging Face Space (CV detector)
1. Create a Space → **SDK: Docker**, **Hardware: CPU basic (FREE)**. (Docker + CPU basic is free — the paid options are GPU hardware.)
2. Drop the trained `model/best.onnx` into `cv-service/model/` (from Kaggle notebook 02) and push, or let `deploy-cv-space.yml` mirror `cv-service/` on the next commit to main.
3. Test directly: `curl -X POST https://<user>-autovaluate-cv.hf.space/detect -d '{"image":"<url>"}' -H 'content-type: application/json'`.

### 3. Render (backend API)
1. New Web Service → connect this repo → root `backend-api/` → it reads `render.yaml`.
2. Set env vars: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CV_SERVICE_URL` (the HF Space URL), `SUPABASE_*`, `ALLOWED_ORIGINS` (your Vercel URL).
3. **RAM note (ADR-014):** the free tier is 512 MB; the torch-based comparables backend exceeds it. For production, install the ONNX query-embedder path and point retrieval at Supabase pgvector (load with `backend-api/agents/load_comparables_supabase.py --create-schema`). The local joblib backend is for dev/demo.

### 4. Vercel (frontend)
1. Import the repo → root `frontend/`.
2. Env var `NEXT_PUBLIC_API_URL` = your Render API URL. (Unset → the UI runs in demo mode, never blank.)

### 5. Supabase
1. Create an empty project (free tier allows 2 per account — pause an unused one if you hit the limit).
2. Run `backend-api/agents/load_comparables_supabase.py --create-schema` with `SUPABASE_DB_URL` set to seed pgvector.
3. The keep-alive workflow pings it every 3 days so it never auto-pauses.

## Cold-start expectations
- **Render free** spins down after 15 min idle (~1 min cold boot). The frontend shows a "waking analysis engine" state, and falls back to a demo result if the API can't be reached in time — the link is never dead.
- **HF Space** sleeps when idle and wakes on first request.

## Local run (works today, no accounts)
```bash
# backend
cd backend-api && USE_TF=0 uvicorn main:app --port 8000
# frontend (new terminal)
cd frontend && echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local && npm run dev
# full test suite
./eval/run_all.sh
```
