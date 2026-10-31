# ai-agent/app/core/circuit_breaker.py
import time
from enum import Enum
from typing import Callable, Any, Optional

class CircuitState(str, Enum):
    CLOSED = "CLOSED"       # Normal operation; calls proceed to external retailer
    OPEN = "OPEN"           # Tripped due to failures; fast-fail to local fallbacks
    HALF_OPEN = "HALF_OPEN" # Recovery probe; testing if external API is back online

class CircuitBreakerOpenException(Exception):
    """Raised when an external API call is blocked by an open circuit breaker."""
    pass

class CircuitBreaker:
    """
    Production-grade Circuit Breaker to isolate external retailer API failures,
    timeouts, and rate-limits, preventing cascade failures in the AI Agent.
    """
    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout_sec: float = 15.0
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_sec = recovery_timeout_sec

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.success_count = 0

    def record_success(self):
        """Record successful external API call and reset failure counters."""
        self.failure_count = 0
        self.state = CircuitState.CLOSED
        self.success_count += 1

    def record_failure(self):
        """Record failed external call and trip circuit if threshold exceeded."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN

    def can_attempt(self) -> bool:
        """Check if request is allowed to reach external API."""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # Check if recovery timeout has elapsed
            if self.last_failure_time and (time.time() - self.last_failure_time >= self.recovery_timeout_sec):
                self.state = CircuitState.HALF_OPEN
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return True

        return False

    async def execute(self, async_func: Callable, *args, **kwargs) -> Any:
        """Execute async external call protected by circuit breaker."""
        if not self.can_attempt():
            raise CircuitBreakerOpenException(
                f"Circuit for external retailer '{self.name}' is OPEN. Fast-failing to internal store fallback."
            )

        try:
            result = await async_func(*args, **kwargs)
            self.record_success()
            return result
        except Exception as e:
            self.record_failure()
            raise e
