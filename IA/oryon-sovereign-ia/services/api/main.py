from __future__ import annotations
import os
import uuid
import datetime as dt
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from shared.policy import Policy
from shared.storage import db
from shared.llm import LLMClient

POLICY_PATH = os.getenv("POLICY_PATH", "/app/policy/policy.yaml")

app = FastAPI(title="ORYON Sovereign IA", version="1.0.0")
policy = Policy.load(POLICY_PATH)
llm = LLMClient()

class ChatRequest(BaseModel):
    repo_path: str = Field(..., description="Path to the mounted target repo inside the container.")
    message: str
    mode: str = Field("operator", description="advisor | operator | autopilot | sovereign")
    thread_id: str | None = None

class ChatResponse(BaseModel):
    thread_id: str
    run_id: str
    mode: str
    status: str
    next_actions: list[str]
    note: str

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        caps = policy.caps(req.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Persist thread + user message
    thread_id = req.thread_id or str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    now = dt.datetime.utcnow().isoformat()

    with db() as con:
        con.execute("INSERT OR IGNORE INTO threads(id, created_at) VALUES(?,?)", (thread_id, now))
        con.execute("INSERT INTO messages(thread_id, role, content, created_at) VALUES(?,?,?,?)", (thread_id, "user", req.message, now))
        con.execute("INSERT INTO runs(id, thread_id, mode, status, created_at) VALUES(?,?,?,?,?)", (run_id, thread_id, req.mode, "queued", now))

    # Minimal "planner" output (stub). The worker does the heavy lifting.
    # In prod, you'd enqueue to Redis/Queue; here we keep it simple: file-based job.
    job_dir = "/app/storage/jobs"
    os.makedirs(job_dir, exist_ok=True)
    job_path = os.path.join(job_dir, f"{run_id}.job")
    with open(job_path, "w", encoding="utf-8") as f:
        f.write(req.model_dump_json())

    return ChatResponse(
        thread_id=thread_id,
        run_id=run_id,
        mode=req.mode,
        status="queued",
        next_actions=[
            "worker:plan",
            "worker:apply_patch (if allowed)",
            "worker:sandbox_test",
            "worker:open_pr (if allowed)",
            "worker:merge_deploy (sovereign + policy thresholds)"
        ],
        note="Job queued. Check storage/runs in SQLite for status."
    )
