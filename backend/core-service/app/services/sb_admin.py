"""Ensure Service Bus queues exist (idempotent).

Called once during lifespan startup. Uses the synchronous management client;
that's fine since it's a one-shot call before the consumer starts.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def ensure_queues(connection_string: str, queue_names: list[str]) -> None:
    if not connection_string:
        return
    try:
        from azure.servicebus.management import ServiceBusAdministrationClient
    except Exception as exc:  # noqa: BLE001
        logger.warning("ServiceBusAdministrationClient unavailable: %s", exc)
        return

    try:
        with ServiceBusAdministrationClient.from_connection_string(connection_string) as client:
            existing = {q.name for q in client.list_queues()}
            for q in queue_names:
                if q not in existing:
                    try:
                        client.create_queue(q)
                        logger.info("[SB-admin] created queue %s", q)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("[SB-admin] could not create %s: %s", q, exc)
                else:
                    logger.info("[SB-admin] queue %s already exists", q)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[SB-admin] queue ensure failed: %s", exc)
