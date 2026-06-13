"""RAID-based distributed telemetry — ported from Synapse_AI.

Public exports:
- logger:                module-level InternalLogger singleton
- RAIDMiddleware:        injects/propagates the X-RAID header on request.state.raid
- RequestLoggerMiddleware: auto-logs every HTTP request on response.finish
"""

from app.telemetry.internal_logger import logger
from app.telemetry.raid import RAIDMiddleware
from app.telemetry.request_logger import RequestLoggerMiddleware

__all__ = ["logger", "RAIDMiddleware", "RequestLoggerMiddleware"]
