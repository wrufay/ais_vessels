#!/usr/bin/env python3
"""
Bulk load decoded AIS CSVs into TimescaleDB.

Usage:
    python pipeline/ingest_csv.py /path/to/csv/dir
    python pipeline/ingest_csv.py /path/to/csv/dir --workers 8
    python pipeline/ingest_csv.py /path/to/single/file.csv

Supports two CSV formats, detected automatically by header:
  - exactEarth satellite format (MMSI, Message_ID, Time, SOG, COG, ...)
  - CCG terrestrial format     (mmsi, message_type, speed, course, reception_timestamp, ...)

Resumable: processed filenames are tracked in the ingestion_log table.
"""

import csv
import io
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ais"
)

# Scotian Shelf bounding box
LON_MIN, LON_MAX = -69.0, -55.0
LAT_MIN, LAT_MAX =  41.0,  47.0

# Message IDs that carry position data
POSITION_MSG_TYPES = {"1", "2", "3", "18", "19", "27"}
# Message IDs that carry vessel static info
STATIC_MSG_TYPES   = {"5", "24"}


def parse_timestamp(raw: str) -> str:
    """Normalise any AIS timestamp to an ISO string Postgres can parse."""
    raw = raw.strip()
    if not raw:
        return ""
    # exactEarth: 20250731T225847Z
    if len(raw) == 16 and "T" in raw and raw.endswith("Z"):
        dt = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    # Everything else (e.g. "2025-12-30 16:40:00") Postgres handles natively
    return raw


def make_row_extractor(fieldnames: list[str]):
    """
    Return a (get_dynamic, get_static) pair of functions suited to the
    detected CSV format. Each function takes a DictReader row and returns
    a tuple of values, or None to skip the row.
    """
    upper = {f.upper() for f in fieldnames}

    if "MMSI" in upper and "MESSAGE_ID" not in upper and "SOG" in upper:
        # exactEarth format
        def get_dynamic(row):
            msg  = row.get("Message_ID", "").strip()
            mmsi = row.get("MMSI", "").strip()
            if not mmsi or msg not in POSITION_MSG_TYPES:
                return None
            try:
                lat = float(row.get("Latitude")  or "nan")
                lon = float(row.get("Longitude") or "nan")
            except ValueError:
                return None
            if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
                return None
            return (
                mmsi,
                parse_timestamp(row.get("Time", "")),
                lat, lon,
                row.get("SOG")       or "",
                row.get("COG")       or "",
                row.get("Heading")   or "",
                row.get("Country_code", "") or "",
            )

        def get_static(row):
            msg  = row.get("Message_ID", "").strip()
            mmsi = row.get("MMSI", "").strip()
            name = row.get("Vessel_Name", "").strip()
            if not mmsi or msg not in STATIC_MSG_TYPES or not name:
                return None
            return (
                mmsi,
                name,
                row.get("Ship_Type")  or None,
                row.get("Call_sign", "").strip() or None,
                row.get("IMO")        or None,
            )

    else:
        # CCG terrestrial format
        def get_dynamic(row):
            msg  = row.get("message_type", "").strip()
            mmsi = row.get("mmsi", "").strip()
            if not mmsi or msg not in POSITION_MSG_TYPES:
                return None
            try:
                lat = float(row.get("latitude")  or "nan")
                lon = float(row.get("longitude") or "nan")
            except ValueError:
                return None
            if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
                return None
            return (
                mmsi,
                parse_timestamp(row.get("reception_timestamp", "")),
                lat, lon,
                row.get("speed")      or "",
                row.get("course")     or "",
                row.get("heading")    or "",
                row.get("source", "") or "",
            )

        def get_static(row):
            msg  = row.get("message_type", "").strip()
            mmsi = row.get("mmsi", "").strip()
            name = row.get("name", "").strip()
            if not mmsi or msg not in STATIC_MSG_TYPES or not name:
                return None
            return (
                mmsi,
                name,
                row.get("ship_type")          or None,
                row.get("callsign", "").strip() or None,
                row.get("imo")                 or None,
            )

    return get_dynamic, get_static


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
        return filename, -1  # -1 = skipped

    dyn_buf = io.StringIO()
    dyn_writer = csv.writer(dyn_buf, lineterminator="\n")
    vessel_rows: dict[str, tuple] = {}
    dyn_count = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        get_dynamic, get_static = make_row_extractor(reader.fieldnames or [])

        for row in reader:
            dyn = get_dynamic(row)
            if dyn:
                dyn_writer.writerow(dyn)
                dyn_count += 1

            sta = get_static(row)
            if sta:
                mmsi = sta[0]
                vessel_rows[mmsi] = sta[1:]  # (name, ship_type, callsign, imo)

    # Bulk copy positions
    dyn_buf.seek(0)
    with conn.cursor() as cur:
        cur.copy_expert("""
            COPY ais_positions
                (mmsi, received_at, latitude, longitude, speed, course, heading, source)
            FROM STDIN WITH (FORMAT CSV, NULL '')
        """, dyn_buf)

    # Upsert vessels (fill in blanks, don't overwrite existing names)
    if vessel_rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO vessels (mmsi, name, ship_type, callsign, imo)
                VALUES %s
                ON CONFLICT (mmsi) DO UPDATE SET
                    name      = COALESCE(vessels.name,      EXCLUDED.name),
                    ship_type = COALESCE(vessels.ship_type, EXCLUDED.ship_type),
                    callsign  = COALESCE(vessels.callsign,  EXCLUDED.callsign),
                    imo       = COALESCE(vessels.imo,       EXCLUDED.imo)
            """, [
                (
                    int(mmsi),
                    name,
                    int(st)  if st  else None,
                    cs,
                    int(imo) if imo else None,
                )
                for mmsi, (name, st, cs, imo) in vessel_rows.items()
            ])

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingestion_log (filename, rows_loaded) VALUES (%s, %s)",
            (filename, dyn_count),
        )

    conn.commit()
    conn.close()
    return filename, dyn_count


def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: python pipeline/ingest_csv.py /path/to/dir [--workers N]")
        print("       python pipeline/ingest_csv.py /path/to/file.csv")
        sys.exit(1)

    target  = Path(args[0])
    workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 4

    if target.is_file():
        files = [target]
    else:
        files = sorted(target.glob("*.csv"))

    if not files:
        print(f"No CSV files found at {target}")
        sys.exit(1)

    print(f"Found {len(files)} file(s) — loading with {workers} worker(s)...")

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
                    print(f"  skip {name}")
                else:
                    total_rows += rows
                    print(f"  {name}: {rows:,} rows")
            except Exception as exc:
                print(f"  ERROR {name}: {exc}")

    print(f"\nDone. {total_rows:,} positions loaded, {skipped} skipped.")


if __name__ == "__main__":
    main()
