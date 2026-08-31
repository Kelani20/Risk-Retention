from enum import Enum

from pydantic import BaseModel


class RiskTier(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class OutreachStatus(str, Enum):
    NOT_CONTACTED = "NOT_CONTACTED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"


class OutreachUpdate(BaseModel):
    status: OutreachStatus
