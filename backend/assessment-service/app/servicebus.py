"""Azure Service Bus producer + consumer wrappers (async).

Mirrors the Synapse_AI publish/subscribe pattern but for plain queues so it
works on the Basic SB tier (no topic/subscription required).

Message envelope (JSON body):
    {
      "subject": "<event.label>",   # e.g. "assessment.scheduled", "notification.create"
      "data": { ... },              # event-specific payload
      "source": "<service-name>",   # producer service id
    }

Both producer and consumer use the same envelope so any service can subscribe.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable

from azure.servicebus import ServiceBusMessage
from azure.servicebus.aio import ServiceBusClient, AutoLockRenewer

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- producer


class ServiceBusPublisher:
    """Long-lived async client; lazy-creates one sender per queue."""

    def __init__(self, connection_string: str, source: str = "assessment-service") -> None:
        self._connection_string = connection_string
        self._source = source
        self._client: ServiceBusClient | None = None
        self._senders: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def _get_client(self) -> ServiceBusClient:
        if self._client is None:
            self._client = ServiceBusClient.from_connection_string(self._connection_string)
        return self._client

    async def _get_sender(self, queue: str):
        async with self._lock:
            sender = self._senders.get(queue)
            if sender is None:
                client = await self._get_client()
                sender = client.get_queue_sender(queue_name=queue)
                self._senders[queue] = sender
            return sender

    async def publish(self, queue: str, subject: str, data: dict[str, Any]) -> None:
        body = json.dumps({"subject": subject, "data": data, "source": self._source})
        msg = ServiceBusMessage(body, subject=subject)
        sender = await self._get_sender(queue)
        await sender.send_messages(msg)
        logger.info("[SB] published %s -> %s", subject, queue)

    async def close(self) -> None:
        for sender in list(self._senders.values()):
            try:
                await sender.close()
            except Exception:  # noqa: BLE001
                pass
        self._senders.clear()
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None


# --------------------------------------------------------------------- consumer

Handler = Callable[[str, dict[str, Any]], Awaitable[None]]
"""Handler signature: (subject, data) -> None."""


class ServiceBusConsumer:
    """Single-queue consumer that dispatches by subject string.

    Uses one long-running task that pulls messages in batches with peek-lock,
    invokes the registered handler, then completes (or abandons on failure).
    """

    def __init__(
        self,
        connection_string: str,
        queue: str,
        handler: Handler,
        max_concurrency: int = 4,
    ) -> None:
        self._connection_string = connection_string
        self._queue = queue
        self._handler = handler
        self._max_concurrency = max_concurrency
        self._task: asyncio.Task | None = None
        self._stopping = asyncio.Event()

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run(), name=f"sb-consumer-{self._queue}")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._task = None

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stopping.is_set():
            try:
                async with ServiceBusClient.from_connection_string(self._connection_string) as client:
                    # AutoLockRenewer keeps the lock fresh while the handler is
                    # running. Long-running jobs (e.g. question generation) can
                    # easily exceed the default 30s lock window otherwise.
                    async with AutoLockRenewer(max_lock_renewal_duration=600) as renewer, \
                            client.get_queue_receiver(
                                queue_name=self._queue,
                                prefetch_count=self._max_concurrency,
                            ) as receiver:
                        logger.info("[SB] consumer ready for queue=%s", self._queue)
                        backoff = 1.0
                        async for msg in receiver:
                            if self._stopping.is_set():
                                break
                            renewer.register(receiver, msg, max_lock_renewal_duration=600)
                            await self._dispatch(receiver, msg)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.error("[SB] consumer for %s crashed: %s", self._queue, exc, exc_info=True)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _dispatch(self, receiver, msg) -> None:
        try:
            raw = b"".join(msg.body) if hasattr(msg, "body") else b""
            envelope = json.loads(raw.decode("utf-8") or "{}")
            subject = envelope.get("subject") or msg.subject or ""
            data = envelope.get("data") or {}
            logger.info("[SB] received %s from %s", subject, self._queue)
            await self._handler(subject, data)
            await receiver.complete_message(msg)
        except Exception as exc:  # noqa: BLE001
            logger.error("[SB] handler failed (%s): %s", self._queue, exc, exc_info=True)
            try:
                await receiver.abandon_message(msg)
            except Exception:  # noqa: BLE001
                pass
