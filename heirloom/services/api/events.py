"""In-process pub/sub for Server-Sent Events (live status lines and network edges)."""
import asyncio
import contextvars
import threading
from typing import Callable, Dict, List, Optional

_subscribers: List[asyncio.Queue] = []
_lock = threading.Lock()
_loop: Optional[asyncio.AbstractEventLoop] = None

# The status-line emitter for the request being answered (set by the orchestrator).
current_emit: contextvars.ContextVar[Optional[Callable[[Dict], None]]] = contextvars.ContextVar("emit", default=None)


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    with _lock:
        _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    with _lock:
        if q in _subscribers:
            _subscribers.remove(q)


def publish(event: Dict) -> None:
    """Thread-safe broadcast to every network-stream subscriber."""
    if _loop is None:
        return
    with _lock:
        subs = list(_subscribers)
    for q in subs:
        def put(q=q):
            if not q.full():
                q.put_nowait(event)
        _loop.call_soon_threadsafe(put)


def status(text: str, **extra) -> None:
    emit = current_emit.get()
    if emit:
        emit({"type": "status", "text": text, **extra})
