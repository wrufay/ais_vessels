"""
Dry-run comparison: how many missing ship_types each source fills, and overlap.
Reads from ais (baseline), does not write anything.
"""

import duckdb
import psycopg2

DB_URL = "postgresql://postgres:postgres@localhost:5432/ais"
# Path to the data source we are testing
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
conn.close()

print(f"Total missing: {len(missing):,}")

duck = duckdb.connect()
duck.execute(f"CREATE TABLE missing AS SELECT unnest({list(missing)}::BIGINT[]) AS mmsi")

# --- Dal SQLite matches ---
dal_matches: set[int] = set()
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
        SELECT DISTINCT ms.mmsi FROM missing ms
        JOIN ({union}) s ON ms.mmsi = s.mmsi
        WHERE s.ship_type IS NOT NULL AND s.ship_type != 0
    """).fetchall()
    dal_matches.update(r[0] for r in rows)
    duck.execute(f"DETACH y{year}")

# --- Static CSV matches ---
rows = duck.execute(f"""
    SELECT DISTINCT m.mmsi
    FROM missing m
    JOIN read_csv('{STATIC_DB_CSV}', ignore_errors=true) s ON m.mmsi = CAST(s.mmsi_s AS BIGINT)
    WHERE s.shiptype_s IS NOT NULL AND s.shiptype_s > 0
""").fetchall()
static_matches = {r[0] for r in rows}

overlap = dal_matches & static_matches
combined = dal_matches | static_matches

print(f"\nDal SQLite only:          {len(dal_matches):,}")
print(f"Static CSV only:          {len(static_matches):,}")
print(f"Overlap (both match):     {len(overlap):,}")
print(f"Combined (either match):  {len(combined):,}")
print(f"Still unknown after both: {len(missing) - len(combined):,}")
