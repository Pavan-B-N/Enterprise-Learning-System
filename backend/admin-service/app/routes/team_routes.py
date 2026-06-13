from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.team_admin_service import TeamAdminService

router = APIRouter(prefix="/teams", tags=["teams"])
team_service = TeamAdminService()


class CreateTeamRequest(BaseModel):
    team_name: str = Field(..., min_length=1)
    description: str = ""


class UpdateTeamRequest(BaseModel):
    team_name: str | None = None
    description: str | None = None


@router.get("/")
async def list_teams():
    return await team_service.list_teams()


@router.get("/{team_id}")
async def get_team(team_id: str):
    team = await team_service.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.post("/", status_code=201)
async def create_team(body: CreateTeamRequest):
    data = body.model_dump()
    return await team_service.create_team(data)


@router.put("/{team_id}")
async def update_team(team_id: str, body: UpdateTeamRequest):
    data = body.model_dump(exclude_none=True)
    updated = await team_service.update_team(team_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Team not found")
    return updated


@router.delete("/{team_id}")
async def delete_team(team_id: str):
    deleted = await team_service.delete_team(team_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"message": "Team deleted"}


@router.get("/{team_id}/report")
async def get_team_report(team_id: str):
    report = await team_service.get_team_report(team_id)
    if not report:
        raise HTTPException(status_code=404, detail="Team not found")
    return report
