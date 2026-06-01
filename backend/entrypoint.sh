#!/bin/sh
set -e

for i in 1 2 3 4 5 6 7 8 9 10; do
    alembic upgrade head && break
    sleep 3
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
