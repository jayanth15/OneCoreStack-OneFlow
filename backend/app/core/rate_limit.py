"""Small in-process sliding-window limiter for sensitive auth endpoints."""
from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, status

_WINDOW_SECONDS = 60.0
_attempts: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_lock = Lock()


def enforce_rate_limit(scope: str, key: str, limit: int) -> None:
    """Reject a key after ``limit`` attempts in the previous minute."""
    if limit <= 0:
        return

    now = monotonic()
    bucket_key = (scope, key)
    with _lock:
        bucket = _attempts[bucket_key]
        cutoff = now - _WINDOW_SECONDS
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(_WINDOW_SECONDS - (now - bucket[0])) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many authentication attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)


def reset_rate_limits() -> None:
    """Clear limiter state (used by isolated tests)."""
    with _lock:
        _attempts.clear()
