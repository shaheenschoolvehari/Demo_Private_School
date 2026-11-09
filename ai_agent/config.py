import os
from pathlib import Path
from dotenv import dotenv_values, load_dotenv

# Base paths
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
SERVER_ENV = ROOT_DIR / "server" / ".env"
AGENT_ENV = BASE_DIR / ".env"

# Load server .env first, then local agent .env overrides
if SERVER_ENV.exists():
    load_dotenv(dotenv_path=SERVER_ENV)
if AGENT_ENV.exists():
    load_dotenv(dotenv_path=AGENT_ENV, override=True)

# Database Configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.dvqrtivlodygagazknjb:demo_school_private@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
)

# JWT Secret - MUST match Express server secret
JWT_SECRET = os.getenv("JWT_SECRET", "shaheen_school_jwt_secret_key_2026_secure")
JWT_ALGORITHM = "HS256"

# Service Configuration
AGENT_PORT = int(os.getenv("AGENT_PORT", "8000"))
AGENT_HOST = os.getenv("AGENT_HOST", "127.0.0.1")

# Optional LLM API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

