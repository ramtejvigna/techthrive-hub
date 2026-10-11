"""A local stand-in for the API Gateway WebSocket API.

It speaks the same contract as production, so Django's code is identical in
both places:

- A browser connects to `ws://HOST:PORT/?ticket=...`. The gateway calls
  Django's `ws/connect/` with the connection id, ticket and shared secret as
  headers, and refuses the socket unless Django answers 2xx.
- When the socket closes it calls `ws/disconnect/`.
- Django sends a message with `POST /@connections/<id>` (410 if it's gone).

Development only: it keeps sockets in memory and is single-process.
"""

import asyncio
import uuid

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run a local WebSocket gateway that mimics API Gateway (development only)."

    def add_arguments(self, parser):
        parser.add_argument("--host", default="0.0.0.0")
        parser.add_argument("--port", type=int, default=8001)
        parser.add_argument(
            "--backend",
            default="http://localhost:8000",
            help="Where Django is running, for the connect/disconnect callbacks.",
        )

    def handle(self, *args, host, port, backend, **options):
        try:
            from aiohttp import web  # noqa: F401
        except ImportError:
            self.stderr.write("aiohttp is required: pip install -r requirements-dev.txt")
            return
        if not settings.WEBSOCKET_SHARED_SECRET:
            self.stderr.write("Set WEBSOCKET_SHARED_SECRET (backend/.env) first.")
            return
        self.stdout.write(f"WebSocket gateway on ws://{host}:{port}/ -> Django at {backend}")
        asyncio.run(_serve(host, port, backend.rstrip("/"), settings.WEBSOCKET_SHARED_SECRET))


async def _serve(host, port, backend, secret):
    import aiohttp
    from aiohttp import web

    sockets: dict[str, web.WebSocketResponse] = {}
    session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))

    async def callback(path, connection_id, ticket=""):
        headers = {"X-WS-Secret": secret, "X-Connection-Id": connection_id, "X-WS-Ticket": ticket}
        async with session.post(f"{backend}/api/notifications/ws/{path}/", headers=headers) as response:
            return response.status

    async def handle_socket(request):
        connection_id = uuid.uuid4().hex
        status = await callback("connect", connection_id, request.query.get("ticket", ""))
        if not 200 <= status < 300:
            return web.Response(status=403, text="Connection refused by backend.")

        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)
        sockets[connection_id] = ws
        print(f"+ {connection_id} ({len(sockets)} open)")
        try:
            async for _message in ws:  # clients don't send anything we act on
                pass
        finally:
            sockets.pop(connection_id, None)
            print(f"- {connection_id} ({len(sockets)} open)")
            await callback("disconnect", connection_id)
        return ws

    async def handle_post(request):
        ws = sockets.get(request.match_info["connection_id"])
        if ws is None or ws.closed:
            return web.Response(status=410)
        await ws.send_str(await request.text())
        return web.Response(status=200)

    app = web.Application()
    app.router.add_get("/", handle_socket)
    app.router.add_post("/@connections/{connection_id}", handle_post)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, host, port).start()
    try:
        await asyncio.Event().wait()
    finally:
        await session.close()
        await runner.cleanup()
