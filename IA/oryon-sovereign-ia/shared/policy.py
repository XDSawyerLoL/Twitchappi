from __future__ import annotations
import fnmatch
import re
import yaml
from dataclasses import dataclass
from typing import Dict, List, Any, Tuple

@dataclass
class ModeCaps:
    can_write_repo: bool
    can_open_pr: bool
    can_merge: bool
    can_deploy: bool

class Policy:
    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw
        self.modes = {k: ModeCaps(**v) for k, v in raw.get("modes", {}).items()}
        self.allow = raw.get("repo", {}).get("allow_write_globs", ["**/*"])
        self.deny = raw.get("repo", {}).get("deny_write_globs", [])
        self.forbidden_regex = [re.compile(p) for p in raw.get("guards", {}).get("forbidden_regex", [])]
        self.allow_commands = raw.get("sandbox", {}).get("allow_commands", [])
        self.step_timeout = int(raw.get("sandbox", {}).get("step_timeout_seconds", 900))
        q = raw.get("quality", {})
        self.min_conf_merge = float(q.get("min_confidence_for_merge", 0.78))
        self.min_conf_deploy = float(q.get("min_confidence_for_deploy", 0.82))

    @staticmethod
    def load(path: str) -> "Policy":
        with open(path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f)
        return Policy(raw)

    def caps(self, mode: str) -> ModeCaps:
        if mode not in self.modes:
            raise ValueError(f"Unknown mode: {mode}")
        return self.modes[mode]

    def path_allowed(self, relpath: str) -> bool:
        # deny has priority
        for pat in self.deny:
            if fnmatch.fnmatch(relpath, pat):
                return False
        for pat in self.allow:
            if fnmatch.fnmatch(relpath, pat):
                return True
        return False

    def patch_allowed(self, patch_text: str) -> Tuple[bool, str]:
        for rx in self.forbidden_regex:
            if rx.search(patch_text):
                return False, f"Forbidden pattern matched: {rx.pattern}"
        return True, "ok"

    def command_allowed(self, cmd: str) -> bool:
        return cmd in self.allow_commands
