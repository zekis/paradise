"""Area PIN security endpoints."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Area, get_db

router = APIRouter(tags=["security"])

MAX_ATTEMPTS = 4
LOCKOUT_MINUTES = 30


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PinStatusResponse(BaseModel):
    has_pin: bool
    is_locked_out: bool
    lockout_seconds_remaining: int = 0


class SetPinRequest(BaseModel):
    pin: str | None = Field(None, min_length=4, max_length=8, pattern=r"^\d{4,8}$")
    current_pin: str | None = Field(None, min_length=4, max_length=8, pattern=r"^\d{4,8}$")


class VerifyPinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=8, pattern=r"^\d{4,8}$")


class VerifyPinResponse(BaseModel):
    success: bool
    attempts_remaining: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/areas/{area_id}/security/status", response_model=PinStatusResponse)
async def get_pin_status(area_id: UUID, db: AsyncSession = Depends(get_db)):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    now = datetime.now(timezone.utc)
    locked_out = area.lockout_until is not None and area.lockout_until > now
    remaining = 0
    if locked_out:
        remaining = max(0, int((area.lockout_until - now).total_seconds()))

    return PinStatusResponse(
        has_pin=area.pin_hash is not None,
        is_locked_out=locked_out,
        lockout_seconds_remaining=remaining,
    )


@router.post("/areas/{area_id}/security/set-pin", status_code=204)
async def set_pin(area_id: UUID, payload: SetPinRequest, db: AsyncSession = Depends(get_db)):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    # If area already has a PIN, require current_pin to change or clear it
    if area.pin_hash is not None:
        if not payload.current_pin:
            raise HTTPException(status_code=400, detail="Current PIN required to change or clear PIN")
        if not bcrypt.checkpw(payload.current_pin.encode(), area.pin_hash.encode()):
            raise HTTPException(status_code=403, detail="Current PIN is incorrect")

    if payload.pin is None:
        # Clear the PIN
        area.pin_hash = None
    else:
        # Set or change the PIN
        hashed = bcrypt.hashpw(payload.pin.encode(), bcrypt.gensalt()).decode()
        area.pin_hash = hashed

    area.failed_attempts = 0
    area.lockout_until = None
    await db.commit()


@router.post("/areas/{area_id}/security/verify-pin", response_model=VerifyPinResponse)
async def verify_pin(area_id: UUID, payload: VerifyPinRequest, db: AsyncSession = Depends(get_db)):
    area = await db.get(Area, area_id)
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    if not area.pin_hash:
        raise HTTPException(status_code=400, detail="No PIN set for this area")

    now = datetime.now(timezone.utc)
    if area.lockout_until and area.lockout_until > now:
        remaining = max(0, int((area.lockout_until - now).total_seconds()))
        raise HTTPException(
            status_code=429,
            detail={"error": "locked_out", "seconds_remaining": remaining},
        )

    correct = bcrypt.checkpw(payload.pin.encode(), area.pin_hash.encode())
    if correct:
        area.failed_attempts = 0
        area.lockout_until = None
        await db.commit()
        return VerifyPinResponse(success=True, attempts_remaining=MAX_ATTEMPTS)

    area.failed_attempts = (area.failed_attempts or 0) + 1
    if area.failed_attempts >= MAX_ATTEMPTS:
        area.lockout_until = now + timedelta(minutes=LOCKOUT_MINUTES)
        area.failed_attempts = 0
    await db.commit()

    remaining_attempts = max(0, MAX_ATTEMPTS - (area.failed_attempts or 0))
    return VerifyPinResponse(success=False, attempts_remaining=remaining_attempts)
