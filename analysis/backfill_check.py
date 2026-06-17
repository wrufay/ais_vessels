import duckdb, psycopg2

conn = psycopg2.connect("postgresql://postgres:postgres@localhost:5432/ais")
with conn.cursor() as cur:
    cur.execute("""
        SELECT DISTINCT v.mmsi FROM vessels v
        JOIN ais_positions p ON v.mmsi = p.mmsi
        WHERE v.ship_type IS NULL
          AND v.mmsi BETWEEN 200000000 AND 799999999
    """)
    mmsis = [r[0] for r in cur.fetchall()]
conn.close()

duck = duckdb.connect()
duck.execute(f"CREATE TABLE missing AS SELECT unnest({mmsis}::BIGINT[]) AS mmsi")

matched = set()
for year in range(2008, 2022):
    if year == 2009:
        continue
    db = f"/mnt/echowind/data/finalCleanedSatelliteAisDataFromDal/DFO_{year}_vacuumed.db"
    duck.execute(f"ATTACH '{db}' AS y{year} (TYPE sqlite, READ_ONLY)")
    tables = [r[0] for r in duck.execute(f"SELECT name FROM (SHOW ALL TABLES) WHERE database='y{year}' AND name LIKE 'static_%_aggregate'").fetchall()]
    if not tables:
        print(f"{year}: no aggregate tables, skipping")
        duck.execute(f"DETACH y{year}")
        continue
    union = " UNION ALL ".join(f"SELECT mmsi, ship_type FROM y{year}.main.{t}" for t in tables)
    rows = duck.execute(f"""
        SELECT DISTINCT ms.mmsi, s.ship_type FROM missing ms
        JOIN ({union}) s ON ms.mmsi = s.mmsi
        WHERE s.ship_type IS NOT NULL AND s.ship_type != 0
    """).fetchall()
    for r in rows:
        matched.add(r[0])
    print(f"{year}: total {len(matched)}")
    duck.execute(f"DETACH y{year}")

print(f"\nfinal: {len(matched):,} / {len(mmsis):,} ({len(matched)/len(mmsis)*100:.1f}%)")
