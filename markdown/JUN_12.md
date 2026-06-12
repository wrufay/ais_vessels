# June 12, 2026

## Learning SQL

First, open an interactive Postgres shell inside a running Docker container with this bash command: (assuming you already added your user, if not you would need to write sg docker -c and this following command in double quotes)

```bash
docker exec -it ocean_noise_visualizer-db-1 psql -U postgres -d ais
```

You should see `ais=#` in the terminal

| Command | Description |
|---------|-------------|
| `\dt` | see all tables |
| `\d ais_positions` | see cols of a table |
| `\q` | quit |

```sql
-- get everything from a table (don't do this on big tables)
SELECT * FROM vessels;

-- you can add a limit to it. which will get the first 10 vessels from the table
SELECT * FROM vessels LIMIT 10;

-- filter rows
SELECT * FROM vessels WHERE name = 'PINK PENGUIN';

-- count rows
SELECT count(*) FROM ais_positions;

-- get specific columns
SELECT mmsi, name, ship_type FROM vessels LIMIT 10;
```

always end queries with a semicolon ; otherwise it will sit there waiting.
