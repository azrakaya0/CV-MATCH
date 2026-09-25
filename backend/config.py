from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "cvmatch_db"
    UPLOAD_DIR: str = os.path.join(os.path.dirname(__file__), "uploads")
    MAX_FILE_SIZE: int = 10 * 1024 * 1024
    AI_MODE: str = "basic"  # "basic" veya "ai" (gelecekte model seçimi için)
    ENVIRONMENT: str = "development"  # development | production
    CORS_ORIGINS: str = "http://localhost:8000,http://localhost:3000"  # virgülle ayrılmış origin listesi
    SEED_DEMO_USERS: bool = False
    JWT_SECRET: str = "cvmatch-dev-secret-change-this-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24
    LOGIN_RATE_LIMIT: int = 10
    LOGIN_RATE_WINDOW_SECONDS: int = 300
    CV_DISPLAY_ID_START: int = 1000
    DEFAULT_MANAGER_USER: str = "yonetici"
    DEFAULT_MANAGER_PASSWORD: str = "yonetici123"
    DEFAULT_EMPLOYEE_USER: str = "calisan"
    DEFAULT_EMPLOYEE_PASSWORD: str = "calisan123"
    DEFAULT_ADMIN_USER: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_DEPT_USER: str = "departman"
    DEFAULT_DEPT_PASSWORD: str = "departman123"
    DEFAULT_CONSULTANT_USER: str = "danisman"
    DEFAULT_CONSULTANT_PASSWORD: str = "danisman123"
    KVKK_POLICY_VERSION: str = "1.1"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@cvmatch.local"
    SMTP_USE_TLS: bool = True
    APP_PUBLIC_URL: str = "http://localhost:8000"
    PASSWORD_RESET_EXPIRE_MINUTES: int = 60
    REGISTER_RATE_LIMIT: int = 5
    REGISTER_RATE_WINDOW_SECONDS: int = 600
    RAG_RATE_LIMIT: int = 30
    RAG_RATE_WINDOW_SECONDS: int = 300

    class Config:
        env_file = ".env"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_development(self) -> bool:
        return not self.is_production

    @property
    def cors_origin_list(self) -> list[str]:
        raw = (self.CORS_ORIGINS or "*").strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    def validate_production_secrets(self) -> None:
        if not self.is_production:
            return
        weak = (
            "cvmatch-dev-secret-degistirin",
            "changeme",
            "secret",
        )
        if self.JWT_SECRET in weak or len(self.JWT_SECRET) < 32:
            raise RuntimeError(
                "Üretim ortamında JWT_SECRET en az 32 karakter ve güçlü bir değer olmalıdır (.env)."
            )


settings = Settings()
