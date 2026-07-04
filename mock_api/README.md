# Mock API

Serves static fixture data so the frontend works without a database.

## Setup

```bash
pip install fastapi uvicorn
cd mock_api
uvicorn main:app --reload --port 8000
```

Then point the frontend at it:

```bash
cd frontend
VITE_API_URL=http://localhost:8000 npm run dev
```

## What's included

- 8 real vessels from the CCG terrestrial AIS feed
- 10 route points per vessel
- All other endpoints (noise overlay, region analysis) return empty/404
