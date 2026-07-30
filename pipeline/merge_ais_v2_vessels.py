#!/usr/bin/env python3
"""
One-time merge: bring ais_v2's enriched vessels table (from the June 18
ship-type backfill, analysis/backfill_shiptypes.py) into ais's vessels
table, which has stayed current for positions but never got that backfill.

Never overwrites an existing non-null value in ais.vessels -- only fills
in vessels missing entirely, or fields that are NULL, using COALESCE, same
pattern as ingest_csv.py / ingest_ccg_streaming.py.

Reversible: run this only after backing up ais.vessels (see
backup_ais_vessels_pre_v2_merge_*.sql at repo root).
"""

import psycopg2
import psycopg2.extras

SRC = "postgresql://postgres:postgres@localhost:5432/ais_v2"
DST = "postgresql://postgres:postgres@localhost:5432/ais"


def main():
    src_conn = psycopg2.connect(SRC)
    dst_conn = psycopg2.connect(DST)
    dst_conn.autocommit = False

    with src_conn.cursor() as cur:
        cur.execute("SELECT mmsi, name, ship_type, callsign, imo FROM vessels")
        rows = cur.fetchall()
    src_conn.close()
    print(f"Read {len(rows):,} vessels from ais_v2.")

    rows = sorted(rows, key=lambda r: r[0])  # sort by mmsi, same deadlock-avoidance as ingest_csv.py

    CHUNK = 50_000
    total = 0
    for i in range(0, len(rows), CHUNK):
        batch = rows[i : i + CHUNK]
        with dst_conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO vessels (mmsi, name, ship_type, callsign, imo)
                VALUES %s
                ON CONFLICT (mmsi) DO UPDATE SET
                    name      = COALESCE(vessels.name,      EXCLUDED.name),
                    ship_type = COALESCE(vessels.ship_type, EXCLUDED.ship_type),
                    callsign  = COALESCE(vessels.callsign,  EXCLUDED.callsign),
                    imo       = COALESCE(vessels.imo,       EXCLUDED.imo)
                """,
                batch,
            )
        dst_conn.commit()
        total += len(batch)
        print(f"  merged {total:,}/{len(rows):,}")

    dst_conn.close()
    print(f"\nDone. {total:,} vessels merged into ais.")


if __name__ == "__main__":
    main()
