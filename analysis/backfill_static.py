"""
Backfill missing ship_types in ais_static using combined_database_xuj.csv only.
Run after: CREATE DATABASE ais_static TEMPLATE ais;
"""

import duckdb
import psycopg2
import psycopg2.extras

DB_URL = "postgresql://postgres:postgres@localhost:5432/ais_static"
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

print(f"MMSIs missing ship_type: {len(missing):,}")

duck = duckdb.connect()
duck.execute(f"CREATE TABLE missing AS SELECT unnest({list(missing)}::BIGINT[]) AS mmsi")

updates: dict[int, int] = {}

rows = duck.execute(f"""
    SELECT DISTINCT m.mmsi, CAST(s.shiptype_s AS INT)
    FROM missing m
    JOIN read_csv('{STATIC_DB_CSV}', ignore_errors=true) s ON m.mmsi = CAST(s.mmsi_s AS BIGINT)
    WHERE s.shiptype_s IS NOT NULL AND s.shiptype_s > 0
""").fetchall()

for mmsi, ship_type in rows:
    updates[mmsi] = ship_type

print(f"combined_database_xuj.csv matched: {len(updates):,} / {len(missing):,}")

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

print(f"\nDone. Remaining unknown after static DB backfill: {remaining:,} / {len(missing):,}")
