from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.role_service import RoleService

router = APIRouter(prefix="/roles", tags=["roles"])
role_service = RoleService()


class CreateRoleRequest(BaseModel):
    role_name: str = Field(..., min_length=1)
    level: str = Field(..., pattern="^(59|60|61|62|63|64|65|66|67|68|69|70)$")
    description: str = ""
    required_courses: list[str] = []
    required_skills: list[str] = []


class UpdateRoleRequest(BaseModel):
    role_name: str | None = None
    level: str | None = Field(None, pattern="^(59|60|61|62|63|64|65|66|67|68|69|70)$")
    description: str | None = None
    required_courses: list[str] | None = None
    required_skills: list[str] | None = None


@router.get("/")
async def list_roles(skip: int = 0, limit: int = 50):
    return await role_service.list_roles(skip, limit)


@router.get("/{role_id}")
async def get_role(role_id: str):
    role = await role_service.get_role(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("/", status_code=201)
async def create_role(body: CreateRoleRequest):
    data = body.model_dump()
    return await role_service.create_role(data)


@router.put("/{role_id}")
async def update_role(role_id: str, body: UpdateRoleRequest):
    data = body.model_dump(exclude_none=True)
    updated = await role_service.update_role(role_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Role not found")
    return updated


@router.delete("/{role_id}")
async def delete_role(role_id: str):
    deleted = await role_service.delete_role(role_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"message": "Role deleted"}
