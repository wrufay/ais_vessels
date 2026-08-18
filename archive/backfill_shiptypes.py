"""
Backfill missing ship_types in ais_v2 from three sources:
  1. vessel_metadata.csv (marinetraffic scraped, from Dal folder)
  2. combined_database_xuj.csv (static AIS database)
  3. Dal SQLite aggregate tables (static_YYYYMM_aggregate)

Only updates rows where ship_type IS NULL — never overwrites existing values.
"""

import duckdb
import psycopg2
import psycopg2.extras

DB_URL = "postgresql://postgres:postgres@localhost:5432/ais_v2"
METADATA_CSV = "/mnt/echowind/data/finalCleanedSatelliteAisDataFromDal/vessel_metadata.csv"
STATIC_DB_CSV = "/mnt/echowind/data/static_ais_database/combined_database_xuj.csv"

conn = psycopg2.connect(DB_URL)

# --- get all MMSIs with missing ship_type that have positions ---
with conn.cursor() as cur:
    cur.execute("""
        SELECT DISTINCT p.mmsi FROM ais_positions p
        LEFT JOIN vessels v USING(mmsi)
        WHERE (v.ship_type IS NULL OR v.mmsi IS NULL)
          AND p.mmsi BETWEEN 200000000 AND 699999999
    """)
    missing = {r[0] for r in cur.fetchall()}

print(f"MMSIs missing ship_type: {len(missing):,}")

duck = duckdb.connect()
duck.execute(f"CREATE TABLE missing AS SELECT unnest({list(missing)}::BIGINT[]) AS mmsi")

updates: dict[int, int] = {}

# --- source 1: vessel_metadata.csv ---
TYPE_MAP = {
    "cargo":                70,
    "cargo - hazard a (major)": 71,
    "cargo - hazard b":    72,
    "cargo - hazard c (minor)": 73,
    "cargo - hazard d (recognizable)": 74,
    "tanker":               80,
    "tanker - hazard a (major)": 81,
    "tanker - hazard b":   82,
    "tanker - hazard c (minor)": 83,
    "tanker - hazard d (recognizable)": 84,
    "fishing":              30,
    "passenger":            60,
    "pilot vessel":         50,
    "sar":                  51,
    "sar aircraft":         51,
    "tug":                  52,
    "port tender":          53,
    "anti-pollution":       54,
    "law enforce":          55,
    "medical trans":        58,
    "sailing vessel":       36,
    "pleasure craft":       37,
    "high speed craft":     40,
    "dredger":              33,
    "dive vessel":          34,
    "military ops":         35,
    "wing in grnd":         20,
    "other":                90,
}

try:
    rows = duck.execute(f"""
        SELECT DISTINCT m.mmsi, v.vesseltype_generic
        FROM missing m
        JOIN read_csv('{METADATA_CSV}', ignore_errors=true) v ON m.mmsi = CAST(v.mmsi AS BIGINT)
        WHERE v.vesseltype_generic IS NOT NULL AND v.vesseltype_generic != '-'
          AND v.vesseltype_generic != 'Unspecified'
    """).fetchall()
    for mmsi, vtype in rows:
        code = TYPE_MAP.get(vtype.lower())
        if code:
            updates[mmsi] = code
    print(f"vessel_metadata.csv matched: {len(updates):,}")
except Exception as e:
    print(f"vessel_metadata.csv skipped: {e}")

# --- source 2: combined_database_xuj.csv ---
try:
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
    print(f"combined_database_xuj.csv matched: {new:,} new")
except Exception as e:
    print(f"combined_database_xuj.csv skipped: {e}")

# --- source 3: Dal SQLite aggregate tables ---
sqlite_updates: dict[int, int] = {}
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
        if mmsi not in updates:  # don't overwrite higher-priority source matches
            sqlite_updates[mmsi] = ship_type
    duck.execute(f"DETACH y{year}")
    print(f"{year}: {len(sqlite_updates):,} new from SQLite")

updates.update(sqlite_updates)
print(f"\nTotal to backfill: {len(updates):,} / {len(missing):,}")

if not updates:
    print("Nothing to update.")
    conn.close()
    exit()

# --- apply updates ---
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
print("Done.")
