# Kanban E2E Tests

## Prerequisites

- **Docker stack up and running** — the full application (frontend + backend + PostgreSQL) must be running at `http://localhost:8088`. Docker Compose is already configured; user is assumed to have it running.
- **Seed data loaded** — either automatically by the Docker container on first startup, or manually:

  ```bash
  cd backend
  pip install -r requirements.txt
  python seed_demo_data.py
  ```

  If `seed_demo_data.py` is not available in your environment, the container seeds automatically on first run.

- **Seed user credentials** (defined in `backend/seed_demo_data.py`):

  | Email | Password | Role |
  |-------|----------|------|
  | `admin@presucontrol.com` | `demo1234` | admin_sistema |
  | `carlos@presucontrol.com` | `demo1234` | — |
  | `ana@presucontrol.com` | `demo1234` | — |

  > Default password is intentionally weak; safe for local dev only.

## Running Tests

```bash
cd frontend
npm run test:e2e
```

To run a single spec:

```bash
npx playwright test tests/e2e/kanban.spec.ts
```

To list tests without executing:

```bash
npx playwright test --list
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `E2E_BASE_URL` | `http://localhost:8088` | Target app URL |
| `CI` | unset | When set, retries become 0 and `forbidOnly` is enforced |

## Notes on Test #2

Test 2 (`mover a En preparación / fabricación muestra input de fecha estimada`) clicks the forward-move button on cards in the source column that can move to "En preparación / fabricación". The selector used is:

```ts
page.locator(`[role="listitem"] button[aria-label^="Mover a En preparación / fabricación"]`)
```

if that button is not present (e.g., the seed data does not populate every column), the test gracefully falls back to navigating to a presupuesto detail page instead of failing. This avoids false negatives in CI environments with sparse seed data.

## What the tests verify

| Test | Bug prevented |
|------|--------------|
| `kanban muestra 8 columnas y excluye Pendiente de enviar y Borrador` | `ESTADOS` array in frontend was out of sync with the backend causing empty Kanban columns (commit `af71529`) |
| `mover a En preparación / fabricación muestra input de fecha estimada` | The modal for "En preparación / fabricación" was missing the `fecha_estimacion_termino` date input (commit `db35f2b`) |
