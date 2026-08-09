import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
import secrets

ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")

class Settings(BaseSettings):
    GEMINI_API_KEY: Optional[str] = None
    LLM_PROVIDER: str = "gemini"
    OLLAMA_MODEL: str = "gemma3:1b"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    CHROMA_PATH: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "chroma_db"))
    JWT_SECRET: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24
    DATABASE_URL: str = f"sqlite+aiosqlite:///{os.path.abspath(os.path.join(os.path.dirname(__file__), 'probot.db'))}"
    CORS_ORIGINS: List[str] = ["*"]

    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

settings = Settings()

