from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Command to run the backend server locally: uvicorn main:app --reload

app = FastAPI()

# CORS configuration for deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "app is running"}


