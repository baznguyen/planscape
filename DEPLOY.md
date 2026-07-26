# Deploying

Railway builds from GitHub `main` automatically. Push and it is live in about
90 seconds. There is no manual step and no secret to hold.

---

## The facts

| | |
|---|---|
| Repo | `baznguyen/planscape`, branch `main` |
| Railway project | **PlanScape** — `bd57ac58-411e-4b1f-85e8-5960a364d62a` |
| Environment | `production` — `f27def06-5a6e-4b29-9ede-da333f37a921` |
| Service | `planscape-web` — `572352b3-3483-4357-9eca-5200d80a2e2d` |
| Live URL | https://planescape.up.railway.app |
| Health check | `/api/health` → `{"ok":true,...}` |
| Region | `asia-southeast1-eqsg3a`, 1 replica |
| Builder | Nixpacks, per `railway.json` |
| Start command | `npm run start -- -p ${PORT:-3000}` — Railway injects `PORT` (8080) |

Note the live domain is spelled **planescape**, with an `e`. It has been renamed
at least once; if it returns
`{"status":"error","code":404,"message":"Application not found"}` the deploy is
probably fine and the domain has moved. Check the Railway dashboard, or
`railway domain`, before debugging the app.

---

## Checking a deploy

```bash
curl -s https://planescape.up.railway.app/api/health
railway status                      # if the CLI is linked
```

A `SUCCESS` deployment plus a 200 from `/api/health` is the whole test. The
health check is wired into `railway.json` with a 120 s timeout, so a container
that never listens gets failed automatically rather than serving errors.

---

## The two ways this has broken

Both are worth knowing because neither shows up locally.

**`npm ci` is stricter than `npm install`.** Railway builds with `npm ci`, which
refuses to run if `package.json` and `package-lock.json` disagree:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: playwright@1.62.0 from lock file
```

Adding a dependency without committing the regenerated lock passes every local
check — because `npm install` reconciles the two silently — and then fails the
deploy. **If you touch `package.json`, run `npm install` and commit the lock**,
and verify with `npm ci` rather than `npm install` before pushing.

**Node version skew.** The build image was on Node 18 while development happens
on 26. `engines.node: ">=20"` in `package.json` now makes Nixpacks select a
matching runtime, and `.nvmrc` says the same to version managers. If you raise
the floor again, check Next's supported range first.

---

## Linking a fresh clone to Railway (only if you want the CLI)

The deploy does not need this — GitHub is already connected — but the CLI is
useful for logs and variables.

```bash
npm i -g @railway/cli
railway login
railway link -p bd57ac58-411e-4b1f-85e8-5960a364d62a
railway status
railway logs
```

---

## Database

`prisma/schema.prisma` exists and **nothing uses it**. There is no
`DATABASE_URL` set and no migration has ever run. When persistence lands (see
`ROADMAP.md`), the sequence is:

```bash
railway add --database postgres
railway variables --set "DATABASE_URL=${{Postgres.DATABASE_URL}}"
npx prisma migrate deploy
```

Until then, do not be alarmed that the service has no variables — it genuinely
needs none.
