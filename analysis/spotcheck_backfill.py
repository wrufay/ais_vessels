import duckdb, psycopg2

conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/ais")
with conn.cursor() as cur:
    cur.execute("SELECT mmsi FROM vessels WHERE ship_type IS NULL LIMIT 20")
    mmsis = [r[0] for r in cur.fetchall()]
conn.close()

duck = duckdb.connect()
duck.execute(f"CREATE TABLE sample AS SELECT unnest({mmsis}::BIGINT[]) AS mmsi")

results = {}
for year in [2019, 2020, 2021]:
    db = f"/mnt/echowind/data/finalCleanedSatelliteAisDataFromDal/DFO_{year}_vacuumed.db"
    duck.execute(f"ATTACH '{db}' AS y{year} (TYPE sqlite, READ_ONLY)")
    tables = [r[0] for r in duck.execute(f"SELECT name FROM (SHOW ALL TABLES) WHERE database='y{year}' AND name LIKE 'static_%_aggregate'").fetchall()]
    if not tables:
        duck.execute(f"DETACH y{year}")
        continue
    union = " UNION ALL ".join(f"SELECT mmsi, ship_type, vessel_name FROM y{year}.main.{t}" for t in tables)
    rows = duck.execute(f"""
        SELECT DISTINCT s.mmsi, s.ship_type, s.vessel_name
        FROM sample ms
        JOIN ({union}) s ON ms.mmsi = s.mmsi
        WHERE s.ship_type IS NOT NULL AND s.ship_type != 0
    """).fetchall()
    for mmsi, ship_type, name in rows:
        if mmsi not in results:
            results[mmsi] = (ship_type, name, year)
    duck.execute(f"DETACH y{year}")

print(f"{'MMSI':<15} {'ship_type':<12} {'vessel_name':<30} {'year found'}")
print("-" * 65)
for mmsi, (ship_type, name, year) in results.items():
    print(f"{mmsi:<15} {ship_type:<12} {str(name):<30} {year}")

print(f"\n{len(results)} / {len(mmsis)} of sampled MMSIs found in SQLite")
