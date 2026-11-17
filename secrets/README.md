# Komanda secrets directory

`src/lib/config/index.ts` is the source of truth for every variable and secret
the runtime consumes. This directory only holds the **values**.

It is gitignored except for the `*.example` templates:

```
secrets/komanda/
  prod.env        # real values for prod  (chmod 600)
  stg.env         # real values for stg   (chmod 600)
  DATABASE_URL    # optional per-variable file (content is the value)
```

You can use either the per-environment `prod.env`/`stg.env` file, per-variable
files, or both. `process.env` takes precedence over file contents, so
systemd/CI can override a value without editing the files.

## Local setup (same layout as the VPS)

From the repository root:

```sh
mkdir -p secrets/komanda
cp secrets/komanda/prod.env.example secrets/komanda/prod.env
cp secrets/komanda/stg.env.example secrets/komanda/stg.env
chmod 700 secrets secrets/komanda
chmod 600 secrets/komanda/prod.env secrets/komanda/stg.env
```

Then fill `secrets/komanda/prod.env` and edit the runtime env file:

```sh
# src/.env.production
KOMANDA_ENV=prod
KOMANDA_SECRETS_DIR=/run/secrets/komanda
```

`docker-compose.prod.yml` mounts `./secrets/komanda` read-only at
`/run/secrets/komanda` for `web`, `fastify`, `worker-outbox` and
`worker-reconcile`, so the path inside the container is identical to the VPS.
Verify the mount before starting:

```sh
docker compose -f docker-compose.prod.yml config
```

## VPS deployment

Use the same tree on the server:

```
/srv/komanda/
  secrets/komanda/prod.env      # 600, owned by the deploying user
  src/.env.production           # KOMANDA_ENV=prod + KOMANDA_SECRETS_DIR
```

Rules:

- `chmod 700` the directories and `600` the files.
- Never commit real values. Only `*.example` templates are versioned.
- One file per environment: never share production secrets with staging.
- `test` is a local profile: unit tests supply their own values and never
  export telemetry unless an OTLP endpoint is set explicitly.

Validate without printing values:

```sh
cd src
KOMANDA_ENV=prod KOMANDA_SECRETS_DIR=../secrets/komanda npx tsx -e \
  "import('./lib/config').then(({describeConfiguration}) => console.log(describeConfiguration()))"
```
