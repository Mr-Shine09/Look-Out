from typing import Literal

from pydantic import BaseModel, Field


class WatchCreate(BaseModel):
    query_text: str = Field(min_length=3)


class FeedbackCreate(BaseModel):
    label: Literal["relevant", "not_relevant"]
    watch_id: str | None = None


class SpecUpdate(BaseModel):
    must_match: list[str] = Field(default_factory=list)
    reject_cases: list[str] = Field(default_factory=list)


class DeliveryUpdate(BaseModel):
    channels: list[str] = Field(default_factory=list)
    discord_webhook: str = ""
    webhook_url: str = ""
    email: str = ""
    test: bool = False


class ProfileUpdate(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    dob: str = ""
    school: str = ""
    major: str = ""
    grad_year: str = ""
    github: str = ""
    portfolio: str = ""
    linkedin: str = ""
    bio: str = ""
