#!/usr/bin/env python3
"""Infra smoke test: prove agent spans + a real Claude call land in Phoenix.

Runs WITHOUT Redis or sentence-transformers, so it validates the tracing wiring
(Infra track task B) on its own. Requires the observability deps + anthropic
installed, Phoenix reachable, and ANTHROPIC_API_KEY in the environment / .env.

Usage:
  python scripts/trace_smoke.py
Then open Phoenix (http://localhost:6006) — project "lookout" — and look for an
`act_pipeline` chain with scout/judge/strategist/drafter/critic child spans plus
an Anthropic LLM span (latency + token usage visible).
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from lookout.tracing import agent_span, set_span_output, setup_tracing


def main() -> int:
    tracer = setup_tracing("lookout-smoke")
    if tracer is None:
        print("Phoenix tracing not active — is Phoenix up and arize-phoenix-otel installed?")
        return 1

    stages = ["scout", "judge", "strategist", "drafter", "critic"]
    with agent_span("act_pipeline", span_kind="CHAIN", input_value="smoke-candidate") as chain:
        for stage in stages:
            with agent_span(f"agent.{stage}", span_kind="AGENT", input_value="smoke-candidate") as s:
                time.sleep(0.05)
                set_span_output(s, f"{stage} stage complete")

        key = os.environ.get("ANTHROPIC_API_KEY")
        if key:
            try:
                import anthropic

                client = anthropic.Anthropic(api_key=key)
                resp = client.messages.create(
                    model=os.getenv("LOOKOUT_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
                    max_tokens=8,
                    messages=[{"role": "user", "content": "reply with the single word: pong"}],
                )
                text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
                set_span_output(chain, f"claude said {text.strip()!r}")
                print(f"Claude span emitted (responded {text.strip()!r}).")
            except Exception as exc:
                print(f"Claude call failed (span for stages still emitted): {type(exc).__name__}: {exc}")
        else:
            print("ANTHROPIC_API_KEY not set — emitting stage spans only, no LLM span.")

    try:
        from opentelemetry import trace

        provider = trace.get_tracer_provider()
        if hasattr(provider, "force_flush"):
            provider.force_flush()
    except Exception:
        pass

    print("Done. Check Phoenix (project 'lookout') at", os.getenv("PHOENIX_URL", "http://localhost:6006"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
