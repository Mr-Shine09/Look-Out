from typing import Literal

from pydantic import BaseModel, Field


class WatchCreate(BaseModel):
    query_text: str = Field(min_length=3)


class FeedbackCreate(BaseModel):
    label: Literal["relevant", "not_relevant"]
    watch_id: str | None = None
