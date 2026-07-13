"""
Pulls a chosen set of real vessels from the real Postgres/TimescaleDB into a
local SQLite file, so the mock API can serve realistic data — including
region/analysis queries — without needing the real database running.

Run:  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ais_v2 \
      venv/bin/python mock_api/seed_db.py 255801680 [more_mmsis...]

Optionally scope positions to a date range (recommended for vessel lists
pulled from a region query, since those are usually tied to a specific
window anyway and full history can be much larger than needed):

      venv/bin/python mock_api/seed_db.py --start 2025-08-01 --end 2025-08-31 \
          255801680 316001449 ...
"""

import argparse
import os
import sqlite3
from pathlib import Path

import psycopg2  # type: ignore
import psycopg2.extras  # type: ignore

DB_PATH = Path(__file__).parent / "mock.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def seed(mmsis: list[int], start: str | None = None, end: str | None = None) -> None:
    database_url = os.environ["DATABASE_URL"]

    DB_PATH.unlink(missing_ok=True)
    sconn = sqlite3.connect(DB_PATH)
    sconn.executescript(SCHEMA_PATH.read_text())

    date_filter = ""
    params: list = [mmsis]
    if start:
        date_filter += " AND received_at >= %s"
        params.append(start)
    if end:
        date_filter += " AND received_at <= %s"
        params.append(end)

    with psycopg2.connect(database_url) as pconn:
        with pconn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT mmsi, name, ship_type, callsign, imo FROM vessels WHERE mmsi = ANY(%s)",
                [mmsis],
            )
            vessels = cur.fetchall()

            cur.execute(
                f"""
                SELECT mmsi, received_at, latitude, longitude, speed, course, heading, source
                FROM ais_positions
                WHERE mmsi = ANY(%s) {date_filter}
                ORDER BY mmsi, received_at
                """,
                params,
            )
            positions = cur.fetchall()

    found = {v["mmsi"] for v in vessels}
    missing = set(mmsis) - found
    if missing:
        print(f"Warning: no vessel record found for MMSI(s): {sorted(missing)}")

    sconn.executemany(
        "INSERT INTO vessels (mmsi, name, ship_type, callsign, imo) VALUES (?, ?, ?, ?, ?)",
        [(v["mmsi"], (v["name"] or "").strip(), v["ship_type"], v["callsign"], v["imo"]) for v in vessels],
    )
    sconn.executemany(
        """
        INSERT INTO ais_positions (mmsi, received_at, latitude, longitude, speed, course, heading, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (p["mmsi"], str(p["received_at"]), p["latitude"], p["longitude"],
             p["speed"], p["course"], p["heading"], p["source"])
            for p in positions
        ],
    )
    sconn.commit()

    for mmsi in mmsis:
        count = sconn.execute(
            "SELECT COUNT(*) FROM ais_positions WHERE mmsi = ?", (mmsi,)
        ).fetchone()[0]
        print(f"  {mmsi}: {count} positions seeded")

    sconn.close()
    print(f"Done — wrote {DB_PATH} ({len(positions)} total positions, {len(vessels)} vessels)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mmsis", nargs="+", type=int)
    parser.add_argument("--start", help="only seed positions on/after this date (YYYY-MM-DD)")
    parser.add_argument("--end", help="only seed positions on/before this date (YYYY-MM-DD)")
    args = parser.parse_args()
    seed(args.mmsis, start=args.start, end=args.end)
