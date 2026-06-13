from fastapi import HTTPException

from app.db.mongo import get_db
from app.models.user import UserLogin, TokenResponse, LoginUser
from app.security.password import verify_password
from app.security.jwt_handler import create_access_token, create_refresh_token, decode_token
from app.config import settings


def _primary_role(user: dict) -> str:
    """Schema stores `roles` as an array; pick the most privileged one."""
    roles = user.get("roles") or ([user["role"]] if user.get("role") else [])
    if not roles:
        return "learner"
    for priv in ("admin", "manager", "learner"):
        if priv in roles:
            return priv
    return roles[0]


class AuthService:
    """Handles login, token issuance, and refresh."""

    def __init__(self):
        self._db = get_db()

    async def login(self, credentials: UserLogin) -> TokenResponse:
        user = await self._db.users.find_one({"email": credentials.email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account deactivated")

        creds = await self._db.user_credentials.find_one({"user_id": user["_id"]})
        password_hash = (creds or {}).get("password_hash") or user.get("password_hash")
        if not password_hash or not verify_password(credentials.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user_id = str(user["_id"])
        role = _primary_role(user)
        roles = list(user.get("roles") or ([user["role"]] if user.get("role") else [role]))

        access_token = create_access_token(user_id=user_id, role=role)
        refresh_token = create_refresh_token(user_id=user_id)

        login_user = LoginUser(
            id=user_id,
            email=user["email"],
            full_name=user["full_name"],
            role=role,
            roles=roles,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.JWT_ACCESS_EXPIRY_MINUTES * 60,
            user=login_user,
        )

    async def refresh(self, refresh_token: str) -> TokenResponse:
        try:
            payload = decode_token(refresh_token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        from bson import ObjectId
        user = await self._db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user or not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="User not found or deactivated")

        user_id = str(user["_id"])
        role = _primary_role(user)

        access_token = create_access_token(user_id=user_id, role=role)
        new_refresh = create_refresh_token(user_id=user_id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh,
            expires_in=settings.JWT_ACCESS_EXPIRY_MINUTES * 60,
        )
