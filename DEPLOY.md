# Deploying to Railway

A Railway project has already been created in your workspace:
**arch-engine** — project id `bd57ac58-411e-4b1f-85e8-5960a364d62a`
(environment `production` = `f27def06-5a6e-4b29-9ede-da333f37a921`).

Railway builds from a **git source or a container image**. I could not push this
repo for you because I have no GitHub credentials in this session, so the last
step is yours:

```bash
# 1. put the code on GitHub
git init && git add -A && git commit -m "arch-engine"
gh repo create <you>/arch-engine --private --source=. --push

# 2. attach it to the existing Railway project
railway link -p bd57ac58-411e-4b1f-85e8-5960a364d62a
railway up                       # or connect the repo in the Railway UI

# 3. add Postgres and run migrations
railway add --database postgres
railway variables --set "DATABASE_URL=${{Postgres.DATABASE_URL}}"
npx prisma migrate deploy
```

`railway.json` already sets the Nixpacks build, the start command bound to
`$PORT`, and a healthcheck on `/api/health`.

## Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Railway plugin reference) |
| `NEXTAUTH_SECRET` | session signing |
| `NEXTAUTH_URL` | public origin |
| `ANTHROPIC_API_KEY` | AI reviewer panel |
| `NREL_API_KEY` | optional — solar/TMY (PVGIS needs no key) |
