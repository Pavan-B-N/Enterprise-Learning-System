from fastapi import APIRouter, Body

from app.models.user import UserLogin, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    return await auth_service.login(credentials)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str = Body(..., embed=True)):
    return await auth_service.refresh(refresh_token)


@router.post("/logout")
async def logout():
    # Stateless JWT — client discards token. Could add token blocklist for production.
    return {"message": "Logged out successfully"}
