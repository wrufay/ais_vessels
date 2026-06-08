#!/usr/bin/env python3
"""
Bulk load decoded AIS CSVs into TimescaleDB.

Usage:
    python pipeline/ingest_csv.py /path/to/csv/dir
    python pipeline/ingest_csv.py /path/to/csv/dir --workers 8

Expected CSV columns (CCG decoded format):
    mmsi, message_type, latitude, longitude, speed, course, heading,
    name, ship_type, callsign, imo, source, reception_timestamp, ...

Resumable: processed filenames are tracked in the ingestion_log table.
Set DATABASE_URL env var or edit the default below.
"""

import csv
import io
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ais"
)

POSITION_MSG_TYPES = {"1", "2", "3", "18", "19"}
STATIC_MSG_TYPES   = {"5", "24"}


def already_loaded(conn, filename: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM ingestion_log WHERE filename = %s", (filename,))
        return cur.fetchone() is not None


def load_file(csv_path: str) -> tuple[str, int]:
    filename = Path(csv_path).name
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    if already_loaded(conn, filename):
        conn.close()
        return filename, -1  # -1 signals skipped

    dyn_buf = io.StringIO()
    dyn_writer = csv.writer(dyn_buf, lineterminator="\n")
    vessel_rows: dict[str, tuple] = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            msg  = row.get("message_type", "").strip()
            mmsi = row.get("mmsi", "").strip()
            if not mmsi:
                continue

            if msg in POSITION_MSG_TYPES:
                dyn_writer.writerow([
                    mmsi,
                    row.get("reception_timestamp", ""),
                    row.get("latitude")  or "",
                    row.get("longitude") or "",
                    row.get("speed")     or "",
                    row.get("course")    or "",
                    row.get("heading")   or "",
                    row.get("source")    or "",
                ])

            if msg in STATIC_MSG_TYPES:
                name = row.get("name", "").strip()
                if name:
                    vessel_rows[mmsi] = (
                        name,
                        row.get("ship_type") or None,
                        row.get("callsign", "").strip() or None,
                        row.get("imo")       or None,
                    )

    # Bulk copy positions
    dyn_buf.seek(0)
    row_count = dyn_buf.read().count("\n")
    dyn_buf.seek(0)

    with conn.cursor() as cur:
        cur.copy_expert("""
            COPY ais_positions
                (mmsi, received_at, latitude, longitude, speed, course, heading, source)
            FROM STDIN WITH (FORMAT CSV, NULL '')
        """, dyn_buf)

    # Upsert vessels (only update name if we have one and existing is null)
    if vessel_rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO vessels (mmsi, name, ship_type, callsign, imo)
                VALUES %s
                ON CONFLICT (mmsi) DO UPDATE SET
                    name      = COALESCE(vessels.name, EXCLUDED.name),
                    ship_type = COALESCE(vessels.ship_type, EXCLUDED.ship_type),
                    callsign  = COALESCE(vessels.callsign, EXCLUDED.callsign),
                    imo       = COALESCE(vessels.imo, EXCLUDED.imo)
            """, [
                (
                    int(mmsi),
                    name,
                    int(st) if st else None,
                    cs,
                    int(imo) if imo else None,
                )
                for mmsi, (name, st, cs, imo) in vessel_rows.items()
            ])

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
        print("Usage: python pipeline/ingest_csv.py /path/to/csv/dir [--workers N]")
        sys.exit(1)

    csv_dir = Path(args[0])
    workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 4

    files = sorted(csv_dir.glob("*.csv"))
    if not files:
        print(f"No CSV files found in {csv_dir}")
        sys.exit(1)

    print(f"Found {len(files)} files — loading with {workers} workers...")
    total_rows = 0
    skipped    = 0

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(load_file, str(f)): f.name for f in files}
        for future in as_completed(futures):
            name = futures[future]
            try:
                _, rows = future.result()
                if rows == -1:
                    skipped += 1
                else:
                    total_rows += rows
                    print(f"  {name}: {rows:,} rows")
            except Exception as exc:
                print(f"  ERROR {name}: {exc}")

    print(f"\nDone. {total_rows:,} positions loaded, {skipped} files skipped (already done).")


if __name__ == "__main__":
    main()
