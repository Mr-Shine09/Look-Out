#!/usr/bin/env python3
"""
Lookout — pre-code connectivity verify gate.

Run this BEFORE writing any feature code. If a key is dead or a service is
down, you want to know at minute 5, not hour 3. Each check is independent:
one failure never hides the others, and nothing here writes any feature code.

Reads everything from environment variables (never hard-code secrets):

  ANTHROPIC_API_KEY        Claude
  REDIS_URL                e.g. redis://default:<pass>@<host>:<port>
                           (or set REDIS_HOST / REDIS_PORT / REDIS_PASSWORD)
  BROWSERBASE_API_KEY      Browserbase
  BROWSERBASE_PROJECT_ID   Browserbase
  PHOENIX_URL              defaults to http://localhost:6006
  SENTRY_DSN               Sentry project DSN (backend error monitoring)

Usage:
  python verify.py

The Browserbase check is SKIPPED by default to protect the 60-min/month free
tier. Opt in with VERIFY_BROWSERBASE=1 when you actually need to confirm it.

Exit code is 0 only if no check FAILED (skipped checks do not fail the gate).
"""

import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()  # silently picks up a .env file in the current directory, if present
except ImportError:
    pass  # dotenv not installed — falls back to whatever's already in the shell env

G, R, Y, DIM, RST = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def check_claude():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return False, "ANTHROPIC_API_KEY not set"
    try:
        import anthropic
    except ImportError:
        return False, "anthropic not installed  ->  pip install anthropic"
    try:
        client = anthropic.Anthropic(api_key=key)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",  # cheapest model is fine for a ping
            max_tokens=8,
            messages=[{"role": "user", "content": "reply with the single word: pong"}],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return True, f"responded {text.strip()!r}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def check_redis():
    try:
        import redis
    except ImportError:
        return False, "redis not installed  ->  pip install redis"
    url = os.environ.get("REDIS_URL")
    try:
        if url:
            r = redis.from_url(url, socket_connect_timeout=5, socket_timeout=5)
        else:
            r = redis.Redis(
                host=os.environ.get("REDIS_HOST", "localhost"),
                port=int(os.environ.get("REDIS_PORT", "6379")),
                password=os.environ.get("REDIS_PASSWORD"),
                socket_connect_timeout=5,
                socket_timeout=5,
            )
        r.ping()
        return True, "PONG"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def check_browserbase():
    # Protect the free tier: only spend a session when explicitly asked.
    if os.environ.get("VERIFY_BROWSERBASE", "0") in {"0", "", "false", "False"}:
        return None, "skipped (set VERIFY_BROWSERBASE=1 to test; protects 60-min/mo quota)"
    key = os.environ.get("BROWSERBASE_API_KEY")
    project = os.environ.get("BROWSERBASE_PROJECT_ID")
    if not key:
        return False, "BROWSERBASE_API_KEY not set"
    if not project:
        return False, "BROWSERBASE_PROJECT_ID not set"
    try:
        from browserbase import Browserbase
    except ImportError:
        return False, "browserbase not installed  ->  pip install browserbase"
    try:
        bb = Browserbase(api_key=key)
        session = bb.sessions.create(project_id=project)
        # Release immediately so the smoke test doesn't sit on your free hour.
        try:
            bb.sessions.update(id=session.id, project_id=project, status="REQUEST_RELEASE")
            released = " (released)"
        except Exception:
            released = " (could not auto-release — check dashboard)"
        return True, f"session {session.id}{released}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def check_phoenix():
    url = os.environ.get("PHOENIX_URL", "http://localhost:6006")
    try:
        import httpx
    except ImportError:
        return False, "httpx not installed  ->  pip install httpx"
    try:
        resp = httpx.get(url, timeout=5, follow_redirects=True)
        if resp.status_code < 500:
            return True, f"HTTP {resp.status_code} at {url}"
        return False, f"HTTP {resp.status_code} at {url}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}  (is Phoenix up at :6006?)"


def check_sentry():
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return None, "SENTRY_DSN not set (backend error monitoring disabled)"
    try:
        import sentry_sdk
    except ImportError:
        return False, "sentry-sdk not installed  ->  pip install 'sentry-sdk[fastapi]'"
    try:
        # Init only — does NOT send an event, so it won't add noise to the dashboard.
        # Confirms the DSN parses and the transport can be constructed (sentry-sdk 2.x API).
        sentry_sdk.init(dsn=dsn, traces_sample_rate=0.0)
        client = sentry_sdk.get_client()
        if client is None or not client.is_active():
            return False, "DSN did not initialize an active Sentry client"
        return True, "DSN valid, client active"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


CHECKS = [
    ("Claude API", check_claude),
    ("Redis", check_redis),
    ("Browserbase", check_browserbase),
    ("Phoenix UI", check_phoenix),
    ("Sentry", check_sentry),
]


def main():
    print(f"\n{DIM}Lookout verify gate — {len(CHECKS)} checks{RST}\n")
    failures = 0
    for name, fn in CHECKS:
        print(f"  checking {name} ...", end="", flush=True)
        passed, detail = fn()
        if passed is None:
            mark = f"{Y}SKIP{RST}"
        elif passed:
            mark = f"{G}PASS{RST}"
        else:
            mark = f"{R}FAIL{RST}"
            failures += 1
        print(f"\r  [{mark}] {name:<13} {DIM}{detail}{RST}")

    print()
    if failures == 0:
        print(f"  {G}Green machine. Plumbing is good — go build.{RST}\n")
        sys.exit(0)
    print(f"  {R}{failures} check(s) failed. Fix the red lines above before feature code.{RST}\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
