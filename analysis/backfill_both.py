"""
This script backfills missing ship_types in `ais_v2` database.

It uses three sources, found in /mnt/echowind/data. In order of running:

1. Dal SQLite (DFO_YYYY_vacuumed.db, 2008–2021): Static AIS records from Dalhousie.
2. combined_database_xuj.csv: Static AIS database with ~160k MMSIs and ship type codes.
3. vessel_metadata.csv: ~156k vessels from MarineTraffic, mapped to AIS codes.

Script only updates rows where ship_type is NULL; never overwrites existing ship types.
"""

import os
import time
import duckdb
import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@localhost:5432/ais_v2")
STATIC_DB_CSV = "/mnt/echowind/data/static_ais_database/combined_database_xuj.csv"
METADATA_CSV = "/mnt/echowind/data/finalCleanedSatelliteAisDataFromDal/vessel_metadata.csv"

TYPE_MAP = {
    "cargo":                            70,
    "cargo - hazard a (major)":         71,
    "cargo - hazard b":                 72,
    "cargo - hazard c (minor)":         73,
    "cargo - hazard d (recognizable)":  74,
    "tanker":                           80,
    "tanker - hazard a (major)":        81,
    "tanker - hazard b":                82,
    "tanker - hazard c (minor)":        83,
    "tanker - hazard d (recognizable)": 84,
    "fishing":                          30,
    "passenger":                        60,
    "pilot vessel":                     50,
    "sar":                              51,
    "sar aircraft":                     51,
    "tug":                              52,
    "port tender":                      53,
    "anti-pollution":                   54,
    "law enforce":                      55,
    "medical trans":                    58,
    "sailing vessel":                   36,
    "pleasure craft":                   37,
    "high speed craft":                 40,
    "dredger":                          33,
    "dive vessel":                      34,
    "military ops":                     35,
    "wing in grnd":                     20,
    "other":                            90,
}

conn = psycopg2.connect(DB_URL)

with conn.cursor() as cur:
    cur.execute("""
        SELECT DISTINCT p.mmsi FROM ais_positions p
        LEFT JOIN vessels v USING(mmsi)
        WHERE (v.ship_type IS NULL OR v.mmsi IS NULL)
          AND p.mmsi BETWEEN 200000000 AND 799999999
    """)
    missing = {r[0] for r in cur.fetchall()}

print(f"MMSIs missing ship_type: {len(missing):,}\n")

duck = duckdb.connect()
duck.execute(f"CREATE TABLE missing AS SELECT unnest({list(missing)}::BIGINT[]) AS mmsi")

updates: dict[int, int] = {}

# --- source 1: Dal SQLite aggregate tables ---
print("--- Dal SQLite ---")
t0 = time.time()
for year in range(2008, 2022):
    if year == 2009:
        continue
    db = f"/mnt/echowind/data/finalCleanedSatelliteAisDataFromDal/DFO_{year}_vacuumed.db"
    duck.execute(f"ATTACH '{db}' AS y{year} (TYPE sqlite, READ_ONLY)")
    tables = [r[0] for r in duck.execute(
        f"SELECT name FROM (SHOW ALL TABLES) WHERE database='y{year}' AND name LIKE 'static_%_aggregate'"
    ).fetchall()]
    if not tables:
        duck.execute(f"DETACH y{year}")
        continue
    union = " UNION ALL ".join(f"SELECT mmsi, ship_type FROM y{year}.main.{t}" for t in tables)
    rows = duck.execute(f"""
        SELECT DISTINCT ms.mmsi, s.ship_type FROM missing ms
        JOIN ({union}) s ON ms.mmsi = s.mmsi
        WHERE s.ship_type IS NOT NULL AND s.ship_type != 0
    """).fetchall()
    for mmsi, ship_type in rows:
        if mmsi not in updates:
            updates[mmsi] = ship_type
    duck.execute(f"DETACH y{year}")
    print(f"  {year}: {len(updates):,} total matched so far")

dal_time = time.time() - t0
dal_count = len(updates)
print(f"Dal SQLite: {dal_count:,} matched in {dal_time:.1f}s\n")

# --- source 2: combined_database_xuj.csv ---
print("--- Static CSV ---")
t0 = time.time()
rows = duck.execute(f"""
    SELECT DISTINCT m.mmsi, CAST(s.shiptype_s AS INT)
    FROM missing m
    JOIN read_csv('{STATIC_DB_CSV}', ignore_errors=true) s ON m.mmsi = CAST(s.mmsi_s AS BIGINT)
    WHERE s.shiptype_s IS NOT NULL AND s.shiptype_s > 0
""").fetchall()
static_new = 0
for mmsi, ship_type in rows:
    if mmsi not in updates:
        updates[mmsi] = ship_type
        static_new += 1
static_time = time.time() - t0
print(f"Static CSV: {static_new:,} additional matched in {static_time:.1f}s\n")

# --- source 3: vessel_metadata.csv ---
print("--- Vessel Metadata CSV ---")
t0 = time.time()
rows = duck.execute(f"""
    SELECT DISTINCT m.mmsi, v.vesseltype_generic
    FROM missing m
    JOIN read_csv('{METADATA_CSV}', ignore_errors=true) v ON m.mmsi = CAST(v.mmsi AS BIGINT)
    WHERE v.vesseltype_generic IS NOT NULL AND v.vesseltype_generic != '-'
      AND v.vesseltype_generic != 'Unspecified'
""").fetchall()
metadata_new = 0
for mmsi, vtype in rows:
    if mmsi not in updates:
        code = TYPE_MAP.get(vtype.lower())
        if code:
            updates[mmsi] = code
            metadata_new += 1
metadata_time = time.time() - t0
print(f"Vessel Metadata CSV: {metadata_new:,} additional matched in {metadata_time:.1f}s\n")

print(f"Total to backfill: {len(updates):,} / {len(missing):,}")

if not updates:
    print("Nothing to update.")
    conn.close()
    exit()

# --- apply updates ---
t0 = time.time()
with conn.cursor() as cur:
    psycopg2.extras.execute_values(cur, """
        INSERT INTO vessels (mmsi, ship_type)
        VALUES %s
        ON CONFLICT (mmsi) DO UPDATE
            SET ship_type = EXCLUDED.ship_type
            WHERE vessels.ship_type IS NULL
    """, [(mmsi, st) for mmsi, st in updates.items()])
conn.commit()
write_time = time.time() - t0
print(f"Written to DB in {write_time:.1f}s")

# --- final report ---
conn2 = psycopg2.connect(DB_URL)
with conn2.cursor() as cur:
    cur.execute("""
        SELECT COUNT(DISTINCT p.mmsi) FROM ais_positions p
        LEFT JOIN vessels v USING(mmsi)
        WHERE (v.ship_type IS NULL OR v.mmsi IS NULL)
          AND p.mmsi BETWEEN 200000000 AND 799999999
    """)
    remaining = cur.fetchone()[0]  # type: ignore
conn2.close()

print(f"\n=== Results ===")
print(f"Dal SQLite:       {dal_count:,} filled  ({dal_time:.1f}s)")
print(f"Static CSV:       {static_new:,} additional  ({static_time:.1f}s)")
print(f"Vessel Metadata:  {metadata_new:,} additional  ({metadata_time:.1f}s)")
print(f"Total filled:     {len(updates):,} / {len(missing):,}")
print(f"Remaining unknown: {remaining:,}")
