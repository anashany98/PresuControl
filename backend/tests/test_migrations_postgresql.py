"""Tests de migraciones validadas contra PostgreSQL (requiere contenedor)."""
import os
import pytest
import subprocess
import sys


def _pg_available() -> bool:
    """Check if a PostgreSQL container/service is available."""
    url = os.getenv("TEST_DATABASE_URL", "")
    return bool(url and url.startswith("postgresql"))


@pytest.mark.skipif(not _pg_available(), reason="Requires TEST_DATABASE_URL pointing to PostgreSQL")
def test_alembic_upgrade_head_against_postgresql():
    """alembic upgrade head funciona contra PostgreSQL real."""
    db_url = os.environ["TEST_DATABASE_URL"]
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True, text=True, cwd="backend",
        env={**os.environ, "DATABASE_URL": db_url},
    )
    assert result.returncode == 0, f"Alembic failed: {result.stderr}"


@pytest.mark.skipif(not _pg_available(), reason="Requires TEST_DATABASE_URL pointing to PostgreSQL")
def test_alembic_downgrade_and_upgrade():
    """alembic downgrade -1 seguido de upgrade head funciona."""
    db_url = os.environ["TEST_DATABASE_URL"]
    env = {**os.environ, "DATABASE_URL": db_url}
    r1 = subprocess.run([sys.executable, "-m", "alembic", "downgrade", "-1"], capture_output=True, text=True, cwd="backend", env=env)
    r2 = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], capture_output=True, text=True, cwd="backend", env=env)
    assert r1.returncode == 0, f"Downgrade failed: {r1.stderr}"
    assert r2.returncode == 0, f"Upgrade failed: {r2.stderr}"


def test_alembic_history_is_linear():
    """Verifica que el historial de migraciones es lineal (sin ramas)."""
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "history"],
        capture_output=True, text=True, cwd="backend",
    )
    assert result.returncode == 0
    lines = [l for l in result.stdout.splitlines() if " -> " in l]
    assert len(lines) > 0, "No migration history found"

    seen = set()
    for line in lines:
        parts = line.strip().split(" -> ")
        if len(parts) == 2:
            rev_id = parts[0]
            assert rev_id not in seen, f"Branch detected at {rev_id}: {line}"
            seen.add(rev_id)
