# Komanda secrets directory

`src/lib/config/index.ts` is the source of truth for every variable and secret
the runtime consumes. This directory only holds the **values**.

Deployment files live outside version control and are mounted read-only into
the containers at `/run/secrets/komanda`:

```
secrets/komanda/
  prod.env        # KOMANDA_ENV=prod
  stg.env         # KOMANDA_ENV=stg
  DATABASE_URL    # optional per-variable file (content is the value)
```

You can use either the per-environment `prod.env`/`stg.env` file, per-variable
files, or both. `process.env` takes precedence over file contents, so
systemd/CI can override a value without editing the files.

Rules:

- `chmod 700` the directory and `600` the files; own them by the deploying user.
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
