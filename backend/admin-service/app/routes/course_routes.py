from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.services.course_service import CourseService

router = APIRouter(prefix="/courses", tags=["courses"])
course_service = CourseService()


class ModuleBody(BaseModel):
    title: str
    topics: list[str] = []


class ReferenceLinkBody(BaseModel):
    url: str
    title: str = ""

    @model_validator(mode="after")
    def default_title_to_url(self):
        if not self.title:
            self.title = self.url
        return self


class CertificationTargetBody(BaseModel):
    vendor: str = ""
    cert_code: str = ""
    official_cert_name: str = ""
    cert_exam_url: str = ""
    exam_cost: float = 0
    level: str = ""
    skills: list[str] = []


class CreateCourseRequest(BaseModel):
    course_name: str = Field(..., min_length=1)
    duration_hours: int = Field(..., gt=0)
    difficulty: str = Field(..., pattern="^(beginner|intermediate|advanced)$")
    weight: float = Field(0.5, ge=0, le=1)
    certification: CertificationTargetBody | None = None
    prerequisites: list[str] = []
    modules: list[ModuleBody] = Field(..., min_length=1)
    reference_links: list[ReferenceLinkBody] = []
    guidance_markdown: str = Field(..., min_length=1)


class UpdateCourseRequest(BaseModel):
    course_name: str | None = None
    duration_hours: int | None = None
    difficulty: str | None = None
    weight: float | None = None
    certification: CertificationTargetBody | None = None
    prerequisites: list[str] | None = None
    modules: list[ModuleBody] | None = None
    reference_links: list[ReferenceLinkBody] | None = None
    guidance_markdown: str | None = None


@router.get("/")
async def list_courses(skip: int = 0, limit: int = 50, fields: str | None = None):
    return await course_service.list_courses(skip, limit, fields=fields)


@router.get("/{course_id}")
async def get_course(course_id: str):
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.post("/", status_code=201)
async def create_course(body: CreateCourseRequest):
    data = body.model_dump()
    return await course_service.create_course(data)


@router.delete("/{course_id}")
async def delete_course(course_id: str):
    deleted = await course_service.delete_course(course_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"message": "Course deleted"}


@router.get("/{course_id}/guidance")
async def get_guidance(course_id: str):
    content = await course_service.get_guidance_markdown(course_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Guidance document not found")
    return {"markdown": content}


@router.put("/{course_id}")
async def update_course(course_id: str, body: UpdateCourseRequest):
    data = body.model_dump(exclude_none=True)
    updated = await course_service.update_course(course_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Course not found")
    return updated
