"""
Backfill missing ship_types in ais_both using Dal SQLite + combined_database_xuj.csv.
Run after: CREATE DATABASE ais_both TEMPLATE ais;
Dal SQLite takes priority; static CSV fills what Dal misses.
"""

import time
import duckdb
import psycopg2
import psycopg2.extras

DB_URL = "postgresql://postgres:postgres@localhost:5432/ais_both"
STATIC_DB_CSV = "/mnt/echowind/data/static_ais_database/combined_database_xuj.csv"

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
new = 0
for mmsi, ship_type in rows:
    if mmsi not in updates:
        updates[mmsi] = ship_type
        new += 1
static_time = time.time() - t0
print(f"Static CSV: {new:,} additional matched in {static_time:.1f}s\n")

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
    remaining = cur.fetchone()[0]
conn2.close()

print(f"\n=== Results ===")
print(f"Dal SQLite:   {dal_count:,} filled  ({dal_time:.1f}s)")
print(f"Static CSV:   {new:,} additional  ({static_time:.1f}s)")
print(f"Total filled: {len(updates):,} / {len(missing):,}")
print(f"Remaining unknown: {remaining:,} / {len(missing):,}")
print(f"(predicted: 1,088)")
