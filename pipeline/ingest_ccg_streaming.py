#!/usr/bin/env python3
"""
Ingests CCG's live terrestrial AIS decode stream into the same ais_positions
/ vessels tables the CSV pipeline (ingest_csv.py) uses.

Input:
NetCDF files at CCG_STREAM_DIR (default /mnt/echowind/ccgStreaming/decode_stream),
written continuously by CCG's own decode pipeline:

    Dynamic_CCG_AIS_UTC_Log_<date>.nc  -- one row per position report
    Static_CCG_AIS_UTC_Log_<date>.nc   -- one row per static/voyage report

Output:
Writes to the same PostgreSQL tables as ingest_csv.py (ais_positions,
vessels), tagged source='CCG_terrestrial'. 

Command to run:
    python pipeline/ingest_ccg_streaming.py

No flags -- takes no arguments. Intended to be invoked periodically (e.g.
cron), same as the noise pipeline's resumable scripts -- it does one pass
over whatever is new and exits; there is no daemon loop.
"""

import glob
import io
import os
from datetime import datetime, timezone

import netCDF4 as nc  # type: ignore
import numpy as np
import psycopg2  # type: ignore
import psycopg2.extras  # type: ignore

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ais"
)
STREAM_DIR = os.environ.get(
    "CCG_STREAM_DIR", "/mnt/echowind/ccgStreaming/decode_stream"
)

# Same Scotian Shelf bbox and AIS message-type split as ingest_csv.py.
LON_MIN, LON_MAX = -69.0, -55.0
LAT_MIN, LAT_MAX = 41.0, 47.0
POSITION_MSG_IDS = (1, 2, 3, 18, 19, 27)
STATIC_MSG_IDS = (5, 24)

SOURCE_TAG = "CCG_terrestrial"
CHUNK = 2_000_000  # rows per read/insert chunk


# get_cursor/set_cursor track how far into each file we've already read --
# this is what makes a run resumable/safe to invoke repeatedly on a
# growing file, instead of re-reading everything from row 0 each time.
def get_cursor(conn, filename: str) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT rows_loaded FROM ingestion_log WHERE filename = %s", (filename,))
        row = cur.fetchone()
        return row[0] if row else 0


def set_cursor(conn, filename: str, count: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ingestion_log (filename, rows_loaded)
            VALUES (%s, %s)
            ON CONFLICT (filename) DO UPDATE SET
                rows_loaded = EXCLUDED.rows_loaded,
                loaded_at   = NOW()
            """,
            (filename, count),
        )
    conn.commit()


def _valid_mask(arr: np.ma.MaskedArray | np.ndarray) -> np.ndarray:
    """True where a value isn't NetCDF-masked/missing (works for int or float dtypes)."""
    if np.ma.isMaskedArray(arr):
        return ~np.ma.getmaskarray(arr)
    return ~np.isnan(arr) if np.issubdtype(arr.dtype, np.floating) else np.ones(len(arr), dtype=bool)


def ingest_dynamic_file(conn, path: str) -> int:
    """Ingest one Dynamic_CCG_AIS_UTC_Log_*.nc file's new rows into
    ais_positions. Returns the number of positions actually inserted (not
    the number that passed filters -- ON CONFLICT DO NOTHING silently
    drops duplicates already loaded)."""
    filename = os.path.basename(path)
    ds = nc.Dataset(path)
    total = ds.dimensions["Dindex"].size
    start = get_cursor(conn, filename)
    if start >= total:
        ds.close()
        return 0

    inserted = 0
    # Read/insert in chunks (CHUNK rows) rather than the whole file at
    # once -- these files grow continuously and can be large.
    for chunk_start in range(start, total, CHUNK):
        chunk_end = min(chunk_start + CHUNK, total)

        msg_type = ds.variables["message_type"][chunk_start:chunk_end]
        mmsi = ds.variables["mmsi"][chunk_start:chunk_end]
        date_num = ds.variables["date_num"][chunk_start:chunk_end]
        lat = ds.variables["latitude"][chunk_start:chunk_end]
        lon = ds.variables["longitude"][chunk_start:chunk_end]
        speed = ds.variables["speed"][chunk_start:chunk_end]
        course = ds.variables["course"][chunk_start:chunk_end]
        heading = ds.variables["heading"][chunk_start:chunk_end]

        # Keep only actual position reports, with usable mmsi/time/coords,
        # inside the Scotian Shelf bbox.
        keep = (
            np.isin(msg_type, POSITION_MSG_IDS)
            & _valid_mask(mmsi)
            & _valid_mask(date_num)
            & _valid_mask(lat)
            & _valid_mask(lon)
            & (lat >= LAT_MIN) & (lat <= LAT_MAX)
            & (lon >= LON_MIN) & (lon <= LON_MAX)
        )
        idx = np.nonzero(keep)[0]
        actually_inserted = 0

        if len(idx) > 0:
            # Build one CSV blob in memory, then COPY it in -- much faster
            # than one INSERT per row for chunks this size.
            buf = io.StringIO()
            for i in idx:
                ts = datetime.fromtimestamp(int(date_num[i]), tz=timezone.utc).isoformat()
                spd = "" if not _valid_mask(speed[i : i + 1])[0] else float(speed[i])
                crs = "" if not _valid_mask(course[i : i + 1])[0] else float(course[i])
                hdg = "" if not _valid_mask(heading[i : i + 1])[0] else float(heading[i])
                buf.write(f"{int(mmsi[i])},{ts},{float(lat[i])},{float(lon[i])},{spd},{crs},{hdg},{SOURCE_TAG}\n")
            buf.seek(0)

            with conn.cursor() as cur:
                # COPY into a temp table first, then INSERT ... ON CONFLICT
                # DO NOTHING from there -- COPY itself can't skip
                # duplicates.
                cur.execute("CREATE TEMP TABLE tmp_positions (LIKE ais_positions INCLUDING DEFAULTS) ON COMMIT DROP")
                cur.copy_expert(
                    """
                    COPY tmp_positions
                        (mmsi, received_at, latitude, longitude, speed, course, heading, source)
                    FROM STDIN WITH (FORMAT CSV, NULL '')
                    """,
                    buf,
                )
                cur.execute("INSERT INTO ais_positions SELECT * FROM tmp_positions ON CONFLICT DO NOTHING")
                actually_inserted = cur.rowcount
            conn.commit()
            inserted += actually_inserted

        set_cursor(conn, filename, chunk_end)
        print(
            f"  [{filename}] rows {chunk_start:,}-{chunk_end:,}/{total:,}: "
            f"{actually_inserted:,} inserted ({len(idx):,} passed filters, "
            f"{len(idx) - actually_inserted:,} already present)"
        )

    ds.close()
    return inserted


def ingest_static_file(conn, path: str) -> int:
    """Ingest one Static_CCG_AIS_UTC_Log_*.nc file's new rows into vessels
    (upsert by mmsi). COALESCE below: name is set once, never updated
    again; ship_type only fills in once it's actually known.
    Returns vessels upserted."""
    filename = os.path.basename(path)
    ds = nc.Dataset(path)
    total = ds.dimensions["Sindex"].size
    start = get_cursor(conn, filename)
    if start >= total:
        ds.close()
        return 0

    upserted = 0
    for chunk_start in range(start, total, CHUNK):
        chunk_end = min(chunk_start + CHUNK, total)

        msg_type = ds.variables["message_type"][chunk_start:chunk_end]
        mmsi = ds.variables["mmsi"][chunk_start:chunk_end]
        shipname = ds.variables["shipname"][chunk_start:chunk_end]
        shiptype = ds.variables["shiptype"][chunk_start:chunk_end]

        # Keep only static/voyage reports with a usable mmsi.
        keep = np.isin(msg_type, STATIC_MSG_IDS) & _valid_mask(mmsi)
        idx = np.nonzero(keep)[0]

        # One row per mmsi (later rows in this chunk win) -- last-seen
        # name/type is enough here, no need to keep every report.
        rows: dict[int, tuple] = {}
        for i in idx:
            # NOTE: unlike every other field in this file, shipname isn't
            # run through _valid_mask().
            name = str(shipname[i]).strip() if shipname[i] not in (None, "N/A", "") else None
            if not name:
                continue
            stype = int(shiptype[i]) if _valid_mask(shiptype[i : i + 1])[0] else None
            rows[int(mmsi[i])] = (int(mmsi[i]), name, stype, None, None)  # no callsign/imo in this feed

        if rows:
            values = sorted(rows.values(), key=lambda r: r[0])
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO vessels (mmsi, name, ship_type, callsign, imo)
                    VALUES %s
                    ON CONFLICT (mmsi) DO UPDATE SET
                        name      = COALESCE(vessels.name,      EXCLUDED.name),
                        ship_type = COALESCE(vessels.ship_type, EXCLUDED.ship_type)
                    """,
                    values,
                )
            conn.commit()
            upserted += len(values)

        set_cursor(conn, filename, chunk_end)
        print(f"  [{filename}] rows {chunk_start:,}-{chunk_end:,}/{total:,}: {len(rows):,} vessels upserted")

    ds.close()
    return upserted


def main():
    # One pass over every stream file currently on disk, then exit --
    # nothing here loops/watches for new files, so this relies on being
    # re-invoked periodically (cron) to pick up what's new each time.
    dynamic_files = sorted(glob.glob(os.path.join(STREAM_DIR, "Dynamic_CCG_AIS_UTC_Log_*.nc")))
    static_files = sorted(glob.glob(os.path.join(STREAM_DIR, "Static_CCG_AIS_UTC_Log_*.nc")))

    if not dynamic_files and not static_files:
        print(f"No CCG stream files found at {STREAM_DIR}")
        return

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    total_positions = 0
    for path in dynamic_files:
        print(f"=== {os.path.basename(path)} ===")
        total_positions += ingest_dynamic_file(conn, path)

    total_vessels = 0
    for path in static_files:
        print(f"=== {os.path.basename(path)} ===")
        total_vessels += ingest_static_file(conn, path)

    conn.close()
    print(f"\nDone. {total_positions:,} new positions, {total_vessels:,} vessels upserted.")


if __name__ == "__main__":
    main()
