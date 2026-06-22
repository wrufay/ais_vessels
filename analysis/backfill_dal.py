"""
Backfill missing ship_types in ais_dal using Dal SQLite aggregate tables only.
Run after: CREATE DATABASE ais_dal TEMPLATE ais;
"""

import duckdb
import psycopg2
import psycopg2.extras

DB_URL = "postgresql://postgres:postgres@localhost:5432/ais_dal"

conn = psycopg2.connect(DB_URL)

with conn.cursor() as cur:
    cur.execute("""
        SELECT DISTINCT p.mmsi FROM ais_positions p
        LEFT JOIN vessels v USING(mmsi)
        WHERE (v.ship_type IS NULL OR v.mmsi IS NULL)
          AND p.mmsi BETWEEN 200000000 AND 799999999
    """)
    missing = {r[0] for r in cur.fetchall()}

print(f"MMSIs missing ship_type: {len(missing):,}")

duck = duckdb.connect()
duck.execute(f"CREATE TABLE missing AS SELECT unnest({list(missing)}::BIGINT[]) AS mmsi")

updates: dict[int, int] = {}

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
    print(f"{year}: {len(updates):,} total matched so far")

print(f"\nTotal to backfill: {len(updates):,} / {len(missing):,}")

if not updates:
    print("Nothing to update.")
    conn.close()
    exit()

with conn.cursor() as cur:
    psycopg2.extras.execute_values(cur, """
        INSERT INTO vessels (mmsi, ship_type)
        VALUES %s
        ON CONFLICT (mmsi) DO UPDATE
            SET ship_type = EXCLUDED.ship_type
            WHERE vessels.ship_type IS NULL
    """, [(mmsi, st) for mmsi, st in updates.items()])
conn.commit()
conn.close()

# --- report final unknown count ---
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

print(f"\nDone. Remaining unknown after Dal backfill: {remaining:,} / {len(missing):,}")
