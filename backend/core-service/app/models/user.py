from pydantic import BaseModel, EmailStr
from enum import Enum


class UserRole(str, Enum):
    LEARNER = "learner"
    MANAGER = "manager"
    ADMIN = "admin"


class UserInDB(BaseModel):
    user_id: str
    email: str
    password_hash: str
    role: UserRole
    linked_entity_id: str
    is_active: bool = True


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    user_id: str
    email: str
    role: UserRole
    linked_entity_id: str
    is_active: bool


class LoginUser(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    roles: list[str] = []


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: LoginUser | None = None
