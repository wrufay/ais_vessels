#!/usr/bin/env python3
"""
Compare vessel metadata completeness: Dal SQLite (2021) vs Postgres.
Key question: do vessels missing ship_type in Postgres have it in the SQLite static tables?
"""

import duckdb
import psycopg2

SQLITE_PATH = "/mnt/echowind/data/finalCleanedSatelliteAisDataFromDal/DFO_2021_vacuumed.db"
DB_URL = "postgresql://postgres:postgres@localhost:5432/ais"

LON_MIN, LON_MAX = -69.0, -55.0
LAT_MIN, LAT_MAX = 41.0, 47.0


def query_postgres():
    conn = psycopg2.connect(DB_URL)
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT mmsi) FROM ais_positions")
        total_rows, total_vessels = cur.fetchone()

        cur.execute("SELECT COUNT(*) FROM vessels WHERE ship_type IS NULL")
        missing_type = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM vessels")
        total_vessel_records = cur.fetchone()[0]

        cur.execute("SELECT mmsi FROM vessels WHERE ship_type IS NULL")
        missing_mmsis = {r[0] for r in cur.fetchall()}

    conn.close()
    return {
        "total_rows": total_rows,
        "total_vessels": total_vessels,
        "total_vessel_records": total_vessel_records,
        "missing_type": missing_type,
        "missing_mmsis": missing_mmsis,
    }


def query_sqlite(missing_mmsis: set):
    duck = duckdb.connect()
    duck.execute(f"ATTACH '{SQLITE_PATH}' AS dfo (TYPE sqlite, READ_ONLY)")

    # Get all static tables
    tables = duck.execute(
        "SELECT name FROM (SHOW ALL TABLES) WHERE database = 'dfo' AND name LIKE 'ais_%_static'"
    ).fetchall()
    table_names = [t[0] for t in tables]

    union_static = " UNION ALL ".join(
        f"SELECT mmsi, ship_type FROM dfo.main.{t}" for t in table_names
    )

    # How many of the Postgres-missing MMSIs appear in SQLite static with a ship_type?
    mmsi_list = ", ".join(str(m) for m in missing_mmsis) if missing_mmsis else "NULL"

    covered = duck.execute(f"""
        SELECT COUNT(DISTINCT mmsi) FROM ({union_static})
        WHERE ship_type IS NOT NULL AND ship_type != 0
          AND mmsi IN ({mmsi_list})
    """).fetchone()[0]

    # Overall: how complete are the SQLite static tables for bbox vessels?
    union_dynamic = " UNION ALL ".join(
        f"SELECT mmsi FROM dfo.main.{t.replace('_static', '_dynamic')}"
        for t in table_names
        if t.replace('_static', '_dynamic') in [r[0] for r in duck.execute("SELECT name FROM (SHOW ALL TABLES) WHERE database = 'dfo'").fetchall()]
    )

    duck.close()
    return {"postgres_missing_covered_by_sqlite": covered}


if __name__ == "__main__":
    print("Querying Postgres...")
    pg = query_postgres()

    print(f"\n=== POSTGRES ===")
    print(f"  position rows:       {pg['total_rows']:,}")
    print(f"  unique mmsi in pos:  {pg['total_vessels']:,}")
    print(f"  vessel records:      {pg['total_vessel_records']:,}")
    print(f"  missing ship_type:   {pg['missing_type']:,} / {pg['total_vessel_records']:,}  ({pg['missing_type']/max(pg['total_vessel_records'],1)*100:.1f}%)")

    print("\nQuerying SQLite (2021) static tables — this may take a minute...")
    sq = query_sqlite(pg["missing_mmsis"])

    print(f"\n=== SQLITE COVERAGE OF POSTGRES GAPS ===")
    print(f"  vessels missing ship_type in Postgres: {pg['missing_type']:,}")
    print(f"  of those, found with ship_type in SQLite 2021: {sq['postgres_missing_covered_by_sqlite']:,}")
