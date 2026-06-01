# Deprecation notice:
# This module is a compatibility shim. Constants have been consolidated into
# backend/app/schemas.py as the single source of truth. Please update imports
# to use app.schemas or app.rules directly.
from ..rules import ACCEPTED_STATES, CLOSED_STATES, ESTADOS, FLOW

__all__ = ["ESTADOS", "CLOSED_STATES", "ACCEPTED_STATES", "FLOW"]