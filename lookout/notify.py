"""Delivery / notification dispatch.

When a watch surfaces a *new* match, Lookout "pings" the configured delivery
channels.  Channels are deliberately lightweight so the demo needs no OAuth:

- ``slack``  -> a Discord (or Slack) incoming-webhook URL (just a URL, no key)
- ``webhook`` -> POST the raw alert JSON to the user's own endpoint
- ``dashboard`` -> handled entirely on the frontend (live toast + sound)
- ``email`` -> reserved (requires SMTP/provider; logged for now)

Config is stored in Redis (set from the Report page) with env-var fallbacks, so
it survives restarts and can be changed live without redeploying.
"""

from __future__ import annotations

import json
from typing import Any

import requests


DELIVERY_KEY = "lookout:delivery"
_DEFAULT_CHANNELS = ["dashboard"]
_ACCENT = 0xA3E635  # Lookout lime, for Discord embeds


class Notifier:
    def __init__(self, store: Any, settings: Any) -> None:
        self.store = store
        self.settings = settings

    # ---- Config ----------------------------------------------------------
    def get_config(self) -> dict[str, Any]:
        raw = None
        try:
            raw = self.store.redis.get(DELIVERY_KEY)
        except Exception:
            raw = None
        cfg: dict[str, Any] = {}
        if raw:
            try:
                cfg = json.loads(raw)
            except Exception:
                cfg = {}
        channels = cfg.get("channels") or list(_DEFAULT_CHANNELS)
        discord = cfg.get("discord_webhook") or (self.settings.discord_webhook_url or "")
        webhook = cfg.get("webhook_url") or (self.settings.notify_webhook_url or "")
        return {
            "channels": [str(c) for c in channels],
            "discord_webhook": str(discord),
            "webhook_url": str(webhook),
            "email": str(cfg.get("email") or ""),
        }

    def set_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        clean = {
            "channels": [str(c) for c in (payload.get("channels") or _DEFAULT_CHANNELS)],
            "discord_webhook": str(payload.get("discord_webhook") or "").strip(),
            "webhook_url": str(payload.get("webhook_url") or "").strip(),
            "email": str(payload.get("email") or "").strip(),
        }
        try:
            self.store.redis.set(DELIVERY_KEY, json.dumps(clean))
        except Exception as exc:
            print(f"[notify] failed to persist delivery config: {exc!r}")
        return clean

    # ---- Dispatch --------------------------------------------------------
    def notify_surfaced(self, watch: dict[str, Any], payload: dict[str, Any]) -> None:
        """Synchronous fan-out; call via ``asyncio.to_thread`` from the engine."""
        cfg = self.get_config()
        channels = set(cfg.get("channels") or [])
        watch_q = str(watch.get("query_text") or "your watch")
        title = str(payload.get("title") or "New match")
        print(f"[notify] PING '{title}' for watch '{watch_q}' -> channels={sorted(channels)}")
        if "slack" in channels and cfg.get("discord_webhook"):
            self._send_discord(cfg["discord_webhook"], watch_q, payload)
        if "webhook" in channels and cfg.get("webhook_url"):
            self._send_webhook(cfg["webhook_url"], watch, payload)

    def send_watch_to_discord(self, watch: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any]:
        """Push a watch's current surfaced (non-expired) candidates to Discord.

        Discord is the only wired-up channel now (see issue #17) — this bypasses
        the generic multi-channel config and always uses the env-configured hook.
        """
        hook = self.settings.discord_webhook_url
        if not hook:
            return {"ok": False, "error": "Discord webhook is not configured (LOOKOUT_DISCORD_WEBHOOK unset)."}
        if not candidates:
            return {"ok": False, "error": "Nothing surfaced yet for this watch."}
        watch_q = str(watch.get("query_text") or "your watch")
        sent = 0
        for cand in candidates:
            if self._send_discord(hook, watch_q, cand):
                sent += 1
        if sent == 0:
            return {"ok": False, "error": "Discord delivery failed — check the webhook URL."}
        return {"ok": True, "sent": sent, "total": len(candidates)}

    def send_test(self, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
        cfg = cfg or self.get_config()
        channels = set(cfg.get("channels") or [])
        sent: list[str] = []
        sample = {
            "title": "Test ping from Lookout",
            "source": "Lookout",
            "url": "",
            "thumbnail": "",
        }
        if "slack" in channels and cfg.get("discord_webhook"):
            ok = self._send_discord(cfg["discord_webhook"], "your watch (test)", sample)
            if ok:
                sent.append("slack")
        if "webhook" in channels and cfg.get("webhook_url"):
            ok = self._send_webhook(cfg["webhook_url"], {"query_text": "test"}, sample)
            if ok:
                sent.append("webhook")
        return {"ok": True, "sent": sent}

    # ---- Channel senders -------------------------------------------------
    def _send_discord(self, hook: str, watch_q: str, payload: dict[str, Any]) -> bool:
        title = str(payload.get("title") or "New match")
        url = str(payload.get("url") or "")
        source = str(payload.get("source") or "")
        embed: dict[str, Any] = {
            "title": title[:240],
            "description": f"Surfaced for **{watch_q}**" + (f" · {source}" if source else ""),
            "color": _ACCENT,
        }
        if url:
            embed["url"] = url
        thumb = str(payload.get("thumbnail") or "")
        if thumb.startswith("http"):
            embed["thumbnail"] = {"url": thumb}
        body = {
            "content": f"\U0001F514 **Lookout** — a match for **{watch_q}** just surfaced.",
            "embeds": [embed],
        }
        try:
            resp = requests.post(hook, json=body, timeout=10)
            resp.raise_for_status()
            return True
        except Exception as exc:
            print(f"[notify] discord webhook failed: {exc!r}")
            return False

    def _send_webhook(self, url: str, watch: dict[str, Any], payload: dict[str, Any]) -> bool:
        body = {
            "event": "lookout.surfaced",
            "watch": {"id": watch.get("id"), "query_text": watch.get("query_text")},
            "candidate": payload,
        }
        try:
            resp = requests.post(url, json=body, timeout=10)
            resp.raise_for_status()
            return True
        except Exception as exc:
            print(f"[notify] webhook POST failed: {exc!r}")
            return False
