from __future__ import annotations
import os, json, time, uuid, subprocess, shlex, datetime as dt
from pathlib import Path
from shared.policy import Policy
from shared.storage import db

POLICY_PATH = os.getenv("POLICY_PATH", "/app/policy/policy.yaml")
policy = Policy.load(POLICY_PATH)

JOBS_DIR = Path("/app/storage/jobs")
JOBS_DIR.mkdir(parents=True, exist_ok=True)

def run_cmd(cmd: str, cwd: str, timeout: int = 900) -> tuple[int, str]:
    p = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        p.kill()
        out = "TIMEOUT"
        return 124, out
    return p.returncode, out

def update_run(run_id: str, status: str, confidence: float | None = None, summary: str | None = None):
    now = dt.datetime.utcnow().isoformat()
    with db() as con:
        con.execute("UPDATE runs SET status=?, confidence=COALESCE(?, confidence), summary=COALESCE(?, summary) WHERE id=?",
                    (status, confidence, summary, run_id))

def main_loop():
    while True:
        jobs = sorted(JOBS_DIR.glob("*.job"), key=lambda p: p.stat().st_mtime)
        if not jobs:
            time.sleep(1.0)
            continue

        job = jobs[0]
        try:
            payload = json.loads(job.read_text(encoding="utf-8"))
        except Exception as e:
            job.unlink(missing_ok=True)
            continue

        run_id = Path(job).stem
        repo_path = payload["repo_path"]
        mode = payload.get("mode", "operator")
        message = payload.get("message", "")

        try:
            caps = policy.caps(mode)
        except Exception:
            update_run(run_id, "failed", summary="Unknown mode")
            job.unlink(missing_ok=True)
            continue

        update_run(run_id, "running")

        # --- PLAN (placeholder, deterministic) ---
        # This worker purposely avoids generating arbitrary code without an LLM wired in.
        # You plug your LLM in shared/llm.py (OpenAI/Mistral/Gemini) and update the planner.
        plan = [
            "Reproduire le 500 /api/youtube/playlist et identifier la cause (quota, clé, format).",
            "Implémenter un fallback (RSS/Atom/NoKey) ou proxy robuste.",
            "Ajouter tests et logs.",
        ]

        # --- APPLY PATCH (demo patch) ---
        # Demo: creates a branch and adds a DIAGNOSTIC.md (safe), without touching runtime code.
        # Replace with real patch generation + validation.
        if caps.can_write_repo:
            branch = f"sovereign/{run_id[:8]}"
            rc, out = run_cmd(f"git checkout -b {branch}", cwd=repo_path, timeout=policy.step_timeout)
            if rc != 0:
                update_run(run_id, "failed", summary=f"git branch failed: {out[-4000:]}")
                job.unlink(missing_ok=True)
                continue

            diag = Path(repo_path) / "DIAGNOSTIC.md"
            diag.write_text(
                "# Diagnostic Sovereign IA\n\n"
                f"Run: {run_id}\n\n"
                "Message utilisateur:\n\n"
                f"> {message}\n\n"
                "Plan:\n\n" + "\n".join([f"- {x}" for x in plan]) + "\n",
                encoding="utf-8"
            )
            rc, out = run_cmd("git add DIAGNOSTIC.md && git commit -m "sovereign: add diagnostic plan"", cwd=repo_path, timeout=policy.step_timeout)
            if rc != 0:
                update_run(run_id, "failed", summary=f"git commit failed: {out[-4000:]}")
                job.unlink(missing_ok=True)
                continue

        # --- SANDBOX TEST (optional) ---
        # Only run allowed commands.
        # You can extend by adding a docker-in-docker runner; kept simple.
        test_cmd = "node -v"
        if policy.command_allowed(test_cmd):
            rc, out = run_cmd(test_cmd, cwd=repo_path, timeout=policy.step_timeout)
            if rc != 0:
                update_run(run_id, "failed", summary=f"sandbox failed: {out[-4000:]}")
                job.unlink(missing_ok=True)
                continue

        # --- Confidence (stub) ---
        confidence = 0.55 if caps.can_write_repo else 0.40

        # --- PR / Merge / Deploy are stubs ---
        # Wire GitHub API here (create PR), then enforce thresholds from policy.
        summary = "Plan enregistré + branche créée (demo). Branche prête pour patch réel via LLM."
        update_run(run_id, "needs_llm", confidence=confidence, summary=summary)

        job.unlink(missing_ok=True)

if __name__ == "__main__":
    main_loop()
