
# OpenCost UI

Frontend application for OpenCost — a React + TypeScript UI providing cost tables, widgets, and report views for cloud cost analysis.

## Overview

This repository contains the frontend part of the OpenCost solution. It is a modern React (TypeScript) application that uses `vite` and `react-router` for development and builds. The UI includes widgets, report views, and integrations with external services to present costs by cloud, service, and resource.

## Project structure

- `app/`: React components, routes and main application logic.
- `public/`: static assets served to the client.
- `scripts/`: project utilities (migrations, admin bootstrap, etc.).
- `db/`: database pool/configuration helpers (used by server/devops code).
- `k8s/`: Kubernetes manifests for local/cluster deployment.
- `Dockerfile*`, `nginx.conf`: container and reverse-proxy configuration files.

## Prerequisites

- Node.js (v18+ recommended)
- npm or yarn
- Docker (optional, for containerized execution)

## Useful scripts

Scripts available in `package.json`:

- `npm run dev` — start the app in development mode.
- `npm run legacy` — start the legacy compatibility dev mode.
- `npm run build` — build the client for production.
- `npm run build:legacy` — build a legacy bundle (`VITE_LEGACY_MODE=true`).
- `npm run build:all` — run `build` then `build:legacy`.
- `npm run start` — serve the static build (`serve build/client -s`).
- `npm run typecheck` — run type generation and `tsc`.
- `npm run migrate` — run migrations via `scripts/migrate.js`.

Examples:

```bash
npm install
npm run dev
```

To build and run the production bundle:

```bash
npm run build
npm run start
```

## Configuration / Environment variables

There is an environment example under `app/components/server/.env` (or similar `.env` files). Before running features that require database or external service access, set the required environment variables (for example PostgreSQL credentials or GCP keys):

- `DATABASE_URL` / `PGHOST` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`
- GCP service account keys if required: `secrets/gcp-service-account.json`

Do not commit sensitive information to the repository.

## Docker

A `Dockerfile` is provided. Example usage:

```bash
# build locally
docker build -t opencost-ui:latest .

# run container
docker run -p 3000:3000 --env-file app/components/server/.env opencost-ui:latest
```

## Deployment

- Kubernetes manifests are located in `k8s/`.
- Basic deployment pattern: create a `ConfigMap`/`Secret` for environment variables, then apply the included `Deployment` and `Service` manifests.

## Tests

This repository does not include explicit unit tests in `package.json`. To add tests, consider using `vitest` or `jest` and add corresponding scripts.

## Contributing

- Fork the repo, create a feature/bugfix branch, open a PR and describe your changes.
- Follow the existing TypeScript/ESLint style and run `npm run typecheck` before submitting.

## Helpful resources

- Configuration files: `vite.config.ts`, `next.config.js` (present depending on compatibility needs)
- Utility scripts: `scripts/migrate.js`, `scripts/bootstrap-admin.js`

---

If you want me to expand this `README.md` with CI/CD instructions, API examples, screenshots, or a detailed developer guide, tell me what to add.
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

# OpenCost UI

<img src="public/logo.png"/>

This is the web UI for the [OpenCost](http://github.com/opencost/opencost) project. You can learn more about the [User Interface](https://www.opencost.io/docs/installation/ui) in the OpenCost docs.

[![OpenCost UI Walkthrough](https://img.youtube.com/vi/lCP4Ci9Kcdg/maxresdefault.jpg)](https://youtu.be/lCP4Ci9Kcdg)
_OpenCost UI Walkthrough_

## Installing

See [Installation Guide](https://opencost.io/docs/installation/install) for the full instructions.

## Using

After following the installation instructions, access the UI by port forwarding:

```
kubectl port-forward --namespace opencost service/opencost 9090
```

## Running Locally

The UI can be run locally using the `npm run serve` command.

```sh
$ npm install
...
$ npm run serve
> opencost-ui@0.1.0 serve
> npx parcel serve src/index.html

Server running at http://localhost:1234
✨ Built in 1.96s
```

And can have a custom URL backend prefix.

```sh
BASE_URL=http://localhost:9090/test npm run serve

> opencost-ui@0.1.0 serve
> npx parcel serve src/index.html

Server running at http://localhost:1234
✨ Built in 772ms
```

In addition, similar behavior can be replicated with the docker container:

```sh
$ docker run -e BASE_URL_OVERRIDE=test -p 9091:9090 -d opencost-ui:latest
$ curl localhost:9091
<html gibberish>
```

## Overriding the Base API URL

For some use cases such as the case of [OpenCost deployed behind an ingress controller](https://github.com/opencost/opencost/issues/1677), it is useful to override the `BASE_URL` variable responsible for requests sent from the UI to the API. This means that instead of sending requests to `<domain>/model/allocation/compute/etc`, requests can be sent to `<domain>/{BASE_URL_OVERRIDE}/allocation/compute/etc`. To do this, supply the environment variable `BASE_URL_OVERRIDE` to the docker image.

```sh
$ docker run -p 9091:9090 -e BASE_URL_OVERRIDE=anything -d opencost-ui:latest
```

## Overriding the Base UI URL Path

To serve the web interface under a path other than the root (`/`), you need to build a custom image using the `vite_basename` build argument.  
For example, you can clone this project and run:

```sh
$ docker build --build-arg vite_basename=/anything --tag opencost-ui:latest .
```

This ensures that all static assets are served from the specified path.

Once the container is running, the UI will be accessible at `<domain>/{vite_basename}`.
