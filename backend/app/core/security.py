import hashlib
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.core.config import settings

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError):
        return False


def _build_payload(sub: str, expire_delta: timedelta, token_type: str) -> dict:
    now = datetime.now(tz=timezone.utc)
    return {
        "sub": sub,
        "type": token_type,
        "iat": now,
        "exp": now + expire_delta,
    }


def create_access_token(user_id: int) -> str:
    payload = _build_payload(
        sub=str(user_id),
        expire_delta=timedelta(minutes=settings.access_token_expire_minutes),
        token_type="access",
    )
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(user_id: int) -> str:
    payload = _build_payload(
        sub=str(user_id),
        expire_delta=timedelta(days=settings.refresh_token_expire_days),
        token_type="refresh",
    )
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on invalid/expired tokens."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def hash_token(token: str) -> str:
    """SHA-256 hash of a token for safe DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()
