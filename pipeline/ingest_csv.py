#!/usr/bin/env python3
"""
This script acts as the pipeline between our source data and SQL database.

Input:
Path to a CSV file or a directory of CSVs containing pre-decoded AIS data.
Script works on any CSV with standard AIS field names (i.e. column names are case-insensitive and can be in any order)

Output:
Writes to a PostgreSQL database containing two tables (initiated by docker/init.sql):

    - ais_positions: time-series optimized table (TimescaleDB) with one row per position ping within the bounding box
    - vessels: regular Postgres table, one row per unique MMSI with static information (e.g. name, ship type, callsign, IMO)

Bulk loads decoded AIS CSVs into TimescaleDB using DuckDB for fast filtering.
Processed filenames are tracked in ingestion_log table, allowing for resumability.

Commands to run:
    python pipeline/ingest_csv.py /path/to/file.csv
    python pipeline/ingest_csv.py /path/to/csv/dir
    python pipeline/ingest_csv.py /path/to/csv/dir --workers 8

"""

import io
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import duckdb # type: ignore
import psycopg2 # type: ignore
import psycopg2.extras # type: ignore

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ais"
)

# Coordinate values used for the Scotian Shelf bounding box
# Remove to display global data, or adjust to your focal region of choice.
LON_MIN, LON_MAX = -69.0, -55.0
LAT_MIN, LAT_MAX =  41.0,  47.0

# AIS message type IDs - determines which rows go into each table (ais_positions or vessels).
POSITION_MSG_IDS = (1, 2, 3, 18, 19, 27)
STATIC_MSG_IDS   = (5, 24)


def parse_timestamp(raw: str) -> str:
    """Normalise AIS timestamps to ISO format Postgres accepts."""
    if not raw:
        return ""
    raw = raw.strip()
    # exactEarth format: YYYYMMDDTHHMMSSZ
    # ISO format: YYYY-MM-DDTHH:MM:SS+00:00
    if len(raw) == 16 and "T" in raw and raw.endswith("Z"):
        dt = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return raw


def find_col(cols: dict, *options: str) -> str | None:
    """Case-insensitive column lookup - returns the actual column name or None."""
    for opt in options:
        if opt.lower() in cols:
            return cols[opt.lower()]
    return None


def already_loaded(conn, filename: str) -> bool:
    """Returns True if filename exists in ingestion_log."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM ingestion_log WHERE filename = %s", (filename,))
        return cur.fetchone() is not None


def load_file(csv_path: str) -> tuple[str, int]:
    """Loads one CSV into the database — returns (filename, row_count), or -1 if already ingested."""
    
    filename = Path(csv_path).name
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    if already_loaded(conn, filename):
        conn.close()
        return filename, -1

    duck = duckdb.connect()
    duck.execute(f"""
        CREATE VIEW raw AS
        SELECT * FROM read_csv(
            '{csv_path}',
            ignore_errors = true,
            null_padding  = true
        )
    """)

    # Build case-insensitive column map
    col_names = [r[0] for r in duck.execute("DESCRIBE raw").fetchall()]
    cols = {c.lower(): c for c in col_names}

    # Flexible column resolution - add new variants when encountered
    mmsi_c    = find_col(cols, "mmsi")
    msg_c     = find_col(cols, "message_id", "message_type")
    lat_c     = find_col(cols, "latitude", "lat")
    lon_c     = find_col(cols, "longitude", "lon")
    sog_c     = find_col(cols, "sog", "speed")
    cog_c     = find_col(cols, "cog", "course")
    head_c    = find_col(cols, "heading")
    time_c    = find_col(cols, "time", "reception_timestamp")
    source_c  = find_col(cols, "country_code", "source")
    name_c    = find_col(cols, "vessel_name", "name")
    type_c    = find_col(cols, "ship_type")
    call_c    = find_col(cols, "call_sign", "callsign")
    imo_c     = find_col(cols, "imo")

    if not all([mmsi_c, msg_c, lat_c, lon_c, time_c]):
        duck.close()
        conn.close()
        raise ValueError(f"Missing required columns in {filename}. Found: {list(cols.keys())[:10]}")

    # Tag source based on detected format
    data_source = "exactEarth" if "SOG" in cols else "CCG_terrestrial"

    def q(c):
        return f'"{c}"' if c else "NULL"

    # Filter positions to Scotian Shelf bbox
    pos_rows = duck.execute(f"""
        SELECT
            TRY_CAST({q(mmsi_c)}  AS BIGINT)  AS mmsi,
            {q(time_c)}::VARCHAR               AS received_at,
            TRY_CAST({q(lat_c)}   AS DOUBLE)   AS latitude,
            TRY_CAST({q(lon_c)}   AS DOUBLE)   AS longitude,
            TRY_CAST({q(sog_c)}   AS DOUBLE)   AS speed,
            TRY_CAST({q(cog_c)}   AS DOUBLE)   AS course,
            TRY_CAST({q(head_c)}  AS DOUBLE)   AS heading,
            '{data_source}'                    AS source
        FROM raw
        WHERE TRY_CAST({q(msg_c)} AS INT) IN {POSITION_MSG_IDS}
          AND TRY_CAST({q(lat_c)} AS DOUBLE) BETWEEN {LAT_MIN} AND {LAT_MAX}
          AND TRY_CAST({q(lon_c)} AS DOUBLE) BETWEEN {LON_MIN} AND {LON_MAX}
          AND TRY_CAST({q(mmsi_c)} AS BIGINT) IS NOT NULL
    """).fetchall()

    # Vessel static info
    ves_rows = []
    if name_c:
        ves_rows = duck.execute(f"""
            SELECT
                TRY_CAST({q(mmsi_c)} AS BIGINT) AS mmsi,
                MAX(NULLIF(NULLIF({q(name_c)}::VARCHAR, ''), 'NOT_AVAILABLE')) AS name,
                MAX(TRY_CAST(NULLIF({q(type_c)}::VARCHAR, 'NOT_AVAILABLE') AS INT)) AS ship_type,
                MAX(NULLIF(NULLIF({q(call_c)}::VARCHAR, ''), 'NOT_AVAILABLE')) AS callsign,
                MAX(TRY_CAST(NULLIF({q(imo_c)}::VARCHAR,  'NOT_AVAILABLE') AS BIGINT)) AS imo
            FROM raw
            WHERE TRY_CAST({q(msg_c)} AS INT) IN {STATIC_MSG_IDS}
              AND NULLIF(NULLIF({q(name_c)}::VARCHAR, ''), 'NOT_AVAILABLE') IS NOT NULL
              AND TRY_CAST({q(mmsi_c)} AS BIGINT) IS NOT NULL
            GROUP BY TRY_CAST({q(mmsi_c)} AS BIGINT)
        """).fetchall()

    duck.close()

    if not pos_rows:
        conn.close()
        return filename, 0

    # Write positions to a CSV buffer and COPY into Postgres
    buf = io.StringIO()
    for row in pos_rows:
        mmsi, received_at, lat, lon, speed, course, heading, source = row
        ts = parse_timestamp(received_at or "")
        buf.write(
            f"{mmsi},{ts},{lat if lat is not None else ''},{lon if lon is not None else ''},"
            f"{speed if speed is not None else ''},{course if course is not None else ''},"
            f"{heading if heading is not None else ''},{source}\n"
        )
    buf.seek(0)

    with conn.cursor() as cur:
        cur.copy_expert("""
            COPY ais_positions
                (mmsi, received_at, latitude, longitude, speed, course, heading, source)
            FROM STDIN WITH (FORMAT CSV, NULL '')
        """, buf)

    # Upsert vessels
    if ves_rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO vessels (mmsi, name, ship_type, callsign, imo)
                VALUES %s
                ON CONFLICT (mmsi) DO UPDATE SET
                    name      = COALESCE(vessels.name,      EXCLUDED.name),
                    ship_type = COALESCE(vessels.ship_type, EXCLUDED.ship_type),
                    callsign  = COALESCE(vessels.callsign,  EXCLUDED.callsign),
                    imo       = COALESCE(vessels.imo,       EXCLUDED.imo)
            """, ves_rows)

    row_count = len(pos_rows)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingestion_log (filename, rows_loaded) VALUES (%s, %s)",
            (filename, row_count),
        )

    conn.commit()
    conn.close()
    return filename, row_count


def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: python pipeline/ingest_csv.py /path/to/dir [--workers N]")
        print("       python pipeline/ingest_csv.py /path/to/file.csv")
        sys.exit(1)

    target  = Path(args[0])
    workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 4

    files = [target] if target.is_file() else sorted(target.rglob("*.csv"))
    if not files:
        print(f"No CSV files found at {target}")
        sys.exit(1)

    print(f"Found {len(files)} file(s) — loading with {workers} worker(s)...")

    total, skipped = 0, 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(load_file, str(f)): f.name for f in files}
        for future in as_completed(futures):
            name = futures[future]
            try:
                _, rows = future.result()
                if rows == -1:
                    skipped += 1
                    print(f"  skip {name}")
                else:
                    total += rows
                    print(f"  {name}: {rows:,} rows")
            except Exception as exc:
                print(f"  ERROR {name}: {exc}")

    print(f"\nDone. {total:,} positions loaded, {skipped} skipped.")


if __name__ == "__main__":
    main()
