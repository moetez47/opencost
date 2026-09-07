# Enclaive Cost Monitoring Platform

A multi-cloud cost monitoring platform combining the OpenCost UI/cost-model
with a custom authentication backend, deployed on Kubernetes via Helm.



---

## 1. Architecture

The platform is made of two independently built images plus a vendored
third-party component:

- **frontend** (`Dockerfile`) — React Router v7 + Vite app, built and served
  behind nginx. nginx also acts as a reverse proxy:
  - `/model/` → the OpenCost cost-model API (`upstream model`,
    `${API_SERVER}:${API_PORT}`)
  - `/api/` → the custom backend (`upstream backend`,
    `${BACKEND_SERVER}:${BACKEND_PORT}`)
  - Everything else → the built SPA, with a fallback rewrite to `index.html`
    for client-side routing.
- **backend** (`Dockerfile.server`) — Node.js auth/API server
  (`app/components/server/`). Handles login, sessions, admin user
  management, and provider-key/cost-data endpoints.
- **OpenCost + OpenCost UI (vendored)** — installed as a **separate Helm
  release** (`opencost`, chart `opencost/opencost` v2.5.29) from the
  upstream OpenCost project, *not* part of this repo's own chart. It
  provides the actual cost-allocation model and ingests cost data from
  Prometheus (cluster resource costs) and cloud billing exports (AWS
  Athena/S3, and via the same mechanism, Azure/GCP — see §7).

Shared infrastructure:
- **PostgreSQL** — used by both the custom backend and OpenCost UI
  (`postgres.opencost.svc.cluster.local:5432`).
- **Prometheus** — OpenCost's cost model reads cluster metrics from
  `prometheus-server.prometheus-system.svc.cluster.local:80`.

```
                        ┌─────────────────────────┐
   client ── https ──▶  │   frontend (nginx+SPA)  │
                        │  /api/   ──▶ backend    │
                        │  /model/ ──▶ opencost   │
                        └─────────────────────────┘
                              │              │
                         backend:4000   opencost:9003
                              │              │
                          Postgres      Prometheus
                                        (+ AWS/Azure/GCP billing exports)
```

---

## 2. Required infrastructure

- A Kubernetes cluster (Minikube used for local/dev deployment).
- An Ingress controller (chart creates an `Ingress` resource, `ingress.yaml`).
- A PostgreSQL instance reachable from the cluster.
- A Prometheus instance reachable from the cluster (for OpenCost's cost
  model). In the current dev cluster this is `prometheus-server` in the
  `prometheus-system` namespace, port `80`.
- (Optional, for full cost visibility) Access to cloud billing exports —
  AWS Athena/S3, and/or Azure/GCP equivalents — see §7.

---

## 3. Environment variables

### Backend (`app/components/server`)

Confirmed by grepping the backend source for `process.env.*` usage:

| Variable | Purpose |
|---|---|
| `PORT` | Backend listen port (`4000` in the Helm chart) |
| `NODE_ENV` | `production` in deployment |
| `FRONTEND_ORIGIN` | CORS allow-origin — set by the chart to `https://<ingress.host>` |
| `DB_HOST`, `DB_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Postgres connection |
| `SESSION_SECRET` | Session/cookie signing secret |
| `OPENAI_ADMIN_KEY` | OpenAI provider key |
| `ANTHROPIC_ADMIN_KEY` | Anthropic provider key |
| `OPENROUTER_MANAGEMENT_KEY` | OpenRouter provider key — **this is the actual name read by the code.** `helm/values.example.yaml`'s comment currently says `OPENROUTER_API_KEY`, which is wrong and should be corrected to `OPENROUTER_MANAGEMENT_KEY` so the two don't drift. |
| `HETZNER_MONITORING_TOKEN` | Hetzner monitoring API token |
| `HETZNER_BACKUP_SERVERS_JSON` | JSON list/config of Hetzner backup servers |
| `GCP_PROJECT_ID`, `GCP_BQ_DATASET`, `GCP_BQ_TABLE`, `GCP_SERVICE_ACCOUNT_KEY_PATH` | **[KNOWN GAP]** Used by `gcp.js` but **not currently present** in `helm/values.example.yaml` or any Deployment template — there is no Helm-managed secret feeding these today. Set them manually on the backend Deployment/Pod for now (e.g. via `kubectl set env` or a hand-added `envFrom`) until they're wired into the chart. |

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_BASE_API_URL` | Build-time API base URL (Vite) — set via `.env` or `--build-arg vite_base_api_url` |
| `BACKEND_SERVER`, `BACKEND_PORT` | nginx upstream target for `/api/` (set to `backend` / chart's backend service port) |
| `API_SERVER`, `API_PORT` | nginx upstream target for `/model/` (OpenCost cost-model service) |
| `UI_PORT`, `UI_PATH`, `BASE_URL` | nginx serving path/port config, templated into `default.nginx.conf` |
| `PROXY_CONNECT_TIMEOUT`, `PROXY_SEND_TIMEOUT`, `PROXY_READ_TIMEOUT` | Proxy timeouts (default `60s`) |
| `LEGACY_MODE` | If `true`, serves the legacy build from `/var/www/legacy` instead of the standard build |

---

## 4. Database initialization

Handled automatically by `app/components/server/docker-entrypoint.sh`, which
runs as the backend container's entrypoint:

1. Waits for Postgres to accept connections (`SELECT 1` retry loop).
2. Runs `npm run migrate` (→ `scripts/migrate.js`), which reads `schema.sql`
   and executes it as-is against the database. This is **not** a versioned
   migration system — it's a single idempotent script (the schema uses
   `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`), so it's
   safe to run on every restart.
3. Runs `npm run bootstrap-admin` (→ `scripts/bootstrap-admin.js`):
   - Checks whether any user with `role = 'admin'` already exists. If so,
     it logs `An admin user already exists. Skipping bootstrap.` and exits
     — safe to run on every restart.
   - If not, it creates one admin user with:
     - username: `admin`
     - email: `admin@opencost.local`
     - a randomly generated 16-character password (`crypto.randomBytes`),
       bcrypt-hashed before storage
     - `first_login: TRUE`
   - **The plaintext password is printed to stdout exactly once, at
     creation time, and is never stored or shown again.**
4. Starts the server (`node server.js`).

### Schema

Two tables, created by `schema.sql`:
- `users` — `user_id` (UUID PK), `username`, `email` (both unique),
  `password_hash`, `role` (`admin`/`user`, CHECK-constrained),
  `first_login` (boolean, defaults `TRUE`), `last_login`, `created_at`,
  `created_by` (self-referencing FK to `users`).
- `password_reset_tokens` — `token_id` (UUID PK), `user_id` (FK, cascades
  on delete), `token_hash`, `expires_at`, `used`, `created_at`.

### Retrieving the first admin password

On first deploy, the admin password is only ever printed once, to the
backend container's logs. Retrieve it immediately after first startup:

```powershell
kubectl logs deploy/backend -n <namespace> | Select-String -Context 2,2 "Admin account created"
```

If you miss it, there is no recovery path via the bootstrap script itself
(it will just skip, since an admin already exists) — use the
`password_reset_tokens` flow, or the `admin-change-password` endpoint
(added per item 3 of the engineering log) once authenticated another way,
or reset the admin's `password_hash` directly in Postgres as a last resort.

Because `first_login` defaults to `TRUE`, the frontend/backend should be
expected to prompt for a password change on the admin's first login —
worth confirming that flow is actually enforced client-side before demoing.

---

## 5. Building both images

Both images are built locally and loaded directly into the cluster's
container runtime — **there is no image registry push in this pipeline.**
(The `build-and-publish-release.yml` GitHub Actions workflow in this repo
pushes to `ghcr.io/opencost/opencost-ui`, but that is the **upstream**
OpenCost project's own release workflow, inherited from the fork this repo
originated from — it is not part of this project's deployment path and
requires credentials this project doesn't have.)

```powershell
# Point your shell's Docker client at Minikube's own daemon
minikube docker-env | Invoke-Expression

# Frontend
docker build -f Dockerfile -t enclaive-frontend:latest .

# Backend
docker build -f Dockerfile.server -t enclaive-backend:latest .
```

Confirm both images are present in Minikube's image store:

```powershell
minikube image ls | Select-String "enclaive"
```

If you build with your host's normal Docker daemon instead (not
`minikube docker-env`), load the images into Minikube afterward:

```powershell
minikube image load enclaive-frontend:latest
minikube image load enclaive-backend:latest
```

Both Deployments in `helm/templates/` are set to `imagePullPolicy: Never`,
so the images **must** already be present in the cluster's runtime before
`helm install`/`upgrade` — nothing will be pulled from a registry.

---

## 6. Helm deployment

The chart (`helm/`, chart name `enclaive-cost-monitoring`) deploys the
`backend` and `frontend` Deployments/Services and an Ingress. It expects
**three pre-existing Kubernetes Secrets** (not created by the chart itself):

```powershell
kubectl create secret generic enclaive-postgres-secret -n <namespace> `
  --from-literal=DB_HOST=<host> `
  --from-literal=DB_PORT=5432 `
  --from-literal=POSTGRES_DB=<db> `
  --from-literal=POSTGRES_USER=<user> `
  --from-literal=POSTGRES_PASSWORD=<password>

kubectl create secret generic enclaive-provider-keys-secret -n <namespace> `
  --from-literal=OPENAI_ADMIN_KEY=<key> `
  --from-literal=ANTHROPIC_ADMIN_KEY=<key> `
  --from-literal=OPENROUTER_MANAGEMENT_KEY=<key> `
  --from-literal=HETZNER_MONITORING_TOKEN=<token> `
  --from-literal=HETZNER_BACKUP_SERVERS_JSON='<json>'

kubectl create secret generic enclaive-session-secret -n <namespace> `
  --from-literal=SESSION_SECRET=<random-long-string>
```

Then copy `helm/values.example.yaml` to `helm/values.yaml`, adjust image
tags/repo names and `ingress.host`, and install:

```powershell
helm install enclaive-cost-monitoring ./helm -f helm/values.yaml -n <namespace> --create-namespace
```

Note: `helm/templates/backend-deployment.yaml` pins `replicas: 1` — the backend uses an
in-memory session store, so running more than one replica would cause
inconsistent logins. Leave it at 1 unless the session store is externalized
first.

### Tearing down a local/test deployment

Once testing is done, remove the release and clean up local resources:

```powershell
# Remove the Helm release (deletes Deployments, Services, Ingress)
helm uninstall enclaive-cost-monitoring -n <namespace>

# Optional: remove the secrets created manually for testing
kubectl delete secret enclaive-postgres-secret enclaive-provider-keys-secret enclaive-session-secret -n <namespace>

# Optional: remove the locally built images from Minikube's image store
minikube image rm enclaive-frontend:latest
minikube image rm enclaive-backend:latest

# Optional: stop or fully delete the Minikube cluster if no longer needed
minikube stop
# or, to remove it entirely:
# minikube delete
```

> **Deployment method:** this project is deployed exclusively through the Helm chart in `helm/`. Do not apply any standalone `kubectl apply -f` manifests for the backend or frontend outside of `helm/templates/` � any such files are legacy artifacts from an earlier approach and are considered obsolete.

---

## 7. Configuring AWS / Azure / GCP cost data (via OpenCost)

Cloud billing cost data is **not** handled by this repo's own chart — it's
configured on the separate vendor `opencost` Helm release
(`opencost/opencost`, installed independently, see `values.yaml` at the
repo root for the currently-applied config).

That release references a secret named by `opencost.cloudIntegrationSecret`
(currently `cloud-costs`), mounted into the `opencost` container at
`/var/configs/cloud-integration.json`. This file's format follows OpenCost's
own multi-cloud billing integration schema (see OpenCost's official docs at
https://opencost.io/docs/ for the exact JSON structure per provider —
AWS/Athena, Azure, and GCP/BigQuery are all supported this way).

The current dev cluster has an active AWS integration (confirmed from
runtime logs — `CloudCost[.../s3://aws-athena-query-results-...]`
ingesting Athena data). Azure/GCP would be added as additional entries in
the same `cloud-integration.json`, following OpenCost's documented format.

Separately, the custom **backend** also has its own, unrelated GCP
integration (`GCP_PROJECT_ID`, `GCP_BQ_DATASET`, `GCP_BQ_TABLE`,
`GCP_SERVICE_ACCOUNT_KEY_PATH` — see §3) which is a different code path
from OpenCost's cloud-integration.json and is not yet wired into the Helm
chart (see the **[KNOWN GAP]** note in §3).

---

## 8. Configuring OpenAI / Anthropic / OpenRouter / Hetzner

These are consumed directly by the custom backend, via
`enclaive-provider-keys-secret` (see §6):

- `OPENAI_ADMIN_KEY` — OpenAI
- `ANTHROPIC_ADMIN_KEY` — Anthropic
- `OPENROUTER_MANAGEMENT_KEY` — OpenRouter (note the naming correction in §3)
- `HETZNER_MONITORING_TOKEN` — Hetzner monitoring API
- `HETZNER_BACKUP_SERVERS_JSON` — Hetzner backup server list/config, as JSON

No further backend-side setup is required beyond populating the secret —
the backend reads these directly from its environment at startup.

---

## Known gaps to close before this doc is considered final

1. `helm/values.example.yaml`'s comment says `OPENROUTER_API_KEY`; the code
   reads `OPENROUTER_MANAGEMENT_KEY`. Fix the comment (or rename in code,
   your call) so they match.
2. GCP backend vars (`GCP_PROJECT_ID` etc.) have no Helm-managed secret —
   decide whether to wire them in or keep them as a manual step.
3. ~~`scripts/bootstrap-admin.js` behavior~~ — resolved, see §4.
4. Confirm the frontend actually enforces a password-change prompt when
   `first_login = TRUE`, since the schema supports it but the flow wasn't
   verified in this session.