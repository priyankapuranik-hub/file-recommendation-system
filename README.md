# File Recommendation System: Containerized CI/CD

This repository contains a small web version of `file_recommend_sys`. It scans text files in `DATA_DIR`, ranks them against a search query, exposes a browser UI, and runs as a Docker container.

## Run locally

```powershell
npm ci
npm test
npm start
# Open http://localhost:3000
```

Useful endpoints:

- `GET /health` - health check, version, and indexed file count
- `GET /metrics` - minimal monitoring metric
- `GET /api/recommend?q=docker+deployment` - JSON recommendations

## Rubric walkthrough

1. **Develop and push:** create a feature branch, make a change, commit it, push it, and open a pull request:
   ```powershell
   git checkout -b feature/web-recommender
   git add .
   git commit -m "Build containerized file recommender"
   git push -u origin feature/web-recommender
   ```
2. **Branches and merging:** merge the pull request into `main` only after the required CI check passes.
3. **Docker image and execution:**
   ```powershell
   docker build -t file-recommendation-system:local .
   docker run --rm -p 3000:3000 -e APP_VERSION=local file-recommendation-system:local
   ```
4. **Deployment demonstration:** Compose provides a repeatable deployment with a mounted data volume:
   ```powershell
   docker build -t file-recommendation-system:local .
   docker compose up -d
   docker compose ps
   ```
5. **CI and tests:** `.github/workflows/ci.yml` runs `npm ci`, tests, a Docker build, and a live health check for every push and pull request.
6. **Environment variables and secrets:** `PORT`, `HOST_PORT`, `APP_VERSION`, and `DATA_DIR` are configuration values, not source-code constants. For real deployment, add credentials under **Settings > Secrets and variables > Actions** and reference them as `${{ secrets.NAME }}`; never commit `.env` files.
7. **Logs and monitoring:**
   ```powershell
   docker compose logs -f file-recommendation
   curl http://localhost:3000/health
   curl http://localhost:3000/metrics
   ```
8. **Release:** after merging to `main`, tag and push a semantic version. The release workflow publishes the image to GitHub Container Registry:
   ```powershell
   git checkout main
   git pull
   git tag v1.0.0
   git push origin v1.0.0
   ```
9. **Rollback:** redeploy the previous known-good tag:
   ```powershell
   $env:IMAGE_NAME = "ghcr.io/OWNER/REPOSITORY"
   $env:APP_VERSION = "v1.0.0"
   docker compose pull
   docker compose up -d
   curl http://localhost:3000/health
   ```

For a classroom demonstration, show the pull request, Actions run, Docker image, running container, logs, release tag, and rollback health check.
