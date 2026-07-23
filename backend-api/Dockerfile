# AutoValuate orchestration API — containerized for dev parity & portability.
#
# Why this exists (the deployed Render service uses the native Python buildpack and
# does NOT require this file): the team develops on Windows while prod is Linux, and
# deps like onnxruntime/fastembed/xgboost are exactly the kind that differ between the
# two. `docker compose up` gives everyone the same Linux runtime locally — and if we
# ever leave Render's free tier (Fly.io / Railway / a VPS to kill the ~50s cold start),
# this image deploys there unchanged.
#
# Matches runtime.txt (python-3.12) and stays torch-free per ADR-014 (fits 512 MB).

FROM python:3.12-slim

# curl: used by the container healthcheck below and handy for debugging.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer-cache the (heavy) dependency install: requirements change far less often
# than code, so day-to-day rebuilds are seconds, not minutes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Same env the README's local-dev command sets; keeps transformers/keras probing off.
ENV USE_TF=0 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8000}/health || exit 1

# Exec form (JSON) so OS signals reach uvicorn for clean shutdown; the wrapping shell
# still expands $PORT (set by Render/Fly/Railway), defaulting to 8000 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
