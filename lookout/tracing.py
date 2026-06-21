"""Observability wiring for the Lookout backend (Infra track).

Two concerns live here, both fail-soft so they never break the demo:

1. Phoenix / OpenInference tracing — every Claude call and every agent stage
   (scout / judge / strategist / drafter / critic) shows up as a span in Phoenix
   at PHOENIX_COLLECTOR_ENDPOINT (defaults to the local Phoenix at :6006).
2. Sentry — backend error monitoring only (no performance tracing), so it does
   not overlap Phoenix (curve) or the agent runtime in the demo.

Nothing here is required for the backend to run: if Phoenix or Sentry are not
installed / not reachable, the helpers degrade to no-ops.
"""

import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

_TRACER: Any = None
_TRACING_READY = False
_SENTRY_READY = False


def _phoenix_endpoint() -> str:
    endpoint = (
        os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
        or os.getenv("PHOENIX_URL")
        or "http://localhost:6006"
    )
    return endpoint.rstrip("/")


def setup_tracing(service_name: str = "lookout-backend") -> Any:
    """Register the Phoenix tracer + instrument Anthropic. Idempotent, fail-soft."""
    global _TRACER, _TRACING_READY
    if _TRACING_READY:
        return _TRACER

    endpoint = _phoenix_endpoint()
    try:
        from phoenix.otel import register

        tracer_provider = register(
            project_name=os.getenv("PHOENIX_PROJECT_NAME", "lookout"),
            endpoint=f"{endpoint}/v1/traces",
            auto_instrument=False,
            set_global_tracer_provider=True,
        )
    except Exception as exc:  # phoenix-otel missing or collector unreachable
        print(f"[tracing] Phoenix tracing disabled: {type(exc).__name__}: {exc}")
        _TRACING_READY = True
        return None

    try:
        from openinference.instrumentation.anthropic import AnthropicInstrumentor

        AnthropicInstrumentor().instrument(tracer_provider=tracer_provider)
    except Exception as exc:
        print(f"[tracing] Anthropic auto-instrumentation skipped: {type(exc).__name__}: {exc}")

    try:
        from opentelemetry import trace

        _TRACER = trace.get_tracer(service_name)
    except Exception:
        _TRACER = None

    _TRACING_READY = True
    print(f"[tracing] Phoenix tracing active -> {endpoint}")
    return _TRACER


def get_tracer() -> Any:
    if not _TRACING_READY:
        return setup_tracing()
    return _TRACER


@contextmanager
def agent_span(
    name: str,
    *,
    span_kind: str = "AGENT",
    input_value: Optional[str] = None,
    attributes: Optional[dict[str, Any]] = None,
) -> Iterator[Any]:
    """Open an OpenInference span for an agent stage. No-op if tracing is off.

    Use `span.set_attribute("output.value", ...)` (or the helper below) to record
    the stage output so it renders in the Phoenix UI.
    """
    tracer = get_tracer()
    if tracer is None:
        yield None
        return

    try:
        from openinference.semconv.trace import (
            OpenInferenceSpanKindValues,
            SpanAttributes,
        )

        kind_attr = SpanAttributes.OPENINFERENCE_SPAN_KIND
        input_attr = SpanAttributes.INPUT_VALUE
        kind_value = getattr(
            OpenInferenceSpanKindValues, span_kind, OpenInferenceSpanKindValues.AGENT
        ).value
    except Exception:
        kind_attr, input_attr, kind_value = (
            "openinference.span.kind",
            "input.value",
            span_kind,
        )

    with tracer.start_as_current_span(name) as span:
        try:
            span.set_attribute(kind_attr, kind_value)
            if input_value is not None:
                span.set_attribute(input_attr, str(input_value))
            for key, value in (attributes or {}).items():
                span.set_attribute(key, value)
        except Exception:
            pass
        yield span


def set_span_output(span: Any, output: Any) -> None:
    """Record a stage's output on its span (renders in Phoenix). No-op if off."""
    if span is None:
        return
    try:
        from openinference.semconv.trace import SpanAttributes

        span.set_attribute(SpanAttributes.OUTPUT_VALUE, str(output))
    except Exception:
        try:
            span.set_attribute("output.value", str(output))
        except Exception:
            pass


def setup_sentry() -> bool:
    """Init Sentry for backend ERROR monitoring only. Fail-soft, idempotent."""
    global _SENTRY_READY
    if _SENTRY_READY:
        return True

    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        print("[sentry] SENTRY_DSN not set — Sentry disabled.")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", "hackathon"),
            # Errors only — no performance/agent tracing (that's Phoenix's job).
            traces_sample_rate=0.0,
            integrations=[StarletteIntegration(), FastApiIntegration()],
        )
    except Exception as exc:
        print(f"[sentry] disabled: {type(exc).__name__}: {exc}")
        return False

    _SENTRY_READY = True
    print("[sentry] backend error monitoring active.")
    return True
