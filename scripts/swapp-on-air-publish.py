#!/usr/bin/env python3
"""SWAPP ON AIR — human-gated, local MP3 publisher. No paid services.
Requires a real MP3, successful ffprobe, review approvals, and source URLs.
Outputs versionable assets/on-air/<slug>.mp3 plus data/swapp-on-air/episodes.json.
Never pushes Git, uploads to Hostinger or fabricates podcast audio.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data/swapp-on-air/episodes.json"
DESTINATION = ROOT / "assets/on-air"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UTC = dt.timezone.utc


def validated_source(value: str) -> dict:
    if "=" not in value:
        raise ValueError("Sources require '--source Label=https://trusted-original.example/page'")
    label, url = value.split("=", 1)
    parsed = urlparse(url)
    if not (1 <= len(label.strip()) <= 120 and parsed.scheme == "https"
            and parsed.netloc and not parsed.username and not parsed.password
            and not parsed.fragment and not any(c.isspace() for c in url)):
        raise ValueError("Invalid HTTPS source or label")
    return {"label": label.strip(), "url": url}


def probe(source: Path) -> int:
    if not source.is_file() or source.suffix.lower() != ".mp3":
        raise ValueError("Real .mp3 file required")
    if not 30000 <= source.stat().st_size <= 75 * 1024 * 1024:
        raise ValueError("MP3 file size outside safety limits")
    if not shutil.which("ffprobe"):
        raise RuntimeError("ffprobe/FFmpeg required to validate audio before publication")
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_name,sample_rate,channels",
         "-of", "json", str(source)],
        capture_output=True, text=True, timeout=30, check=True,
    )
    metadata = json.loads(result.stdout)
    streams = [s for s in metadata.get("streams", []) if s.get("codec_name") == "mp3"]
    duration = float(metadata.get("format", {}).get("duration") or 0)
    if not streams or not (20 <= duration <= 7200):
        raise ValueError("Invalid MP3 stream or episode duration")
    if not all(int(s.get("sample_rate", 0)) >= 16000 and 1 <= int(s.get("channels", 0)) <= 2 for s in streams):
        raise ValueError("Unacceptable MP3 sample rate/channels")
    return round(duration)


def build_release(args: argparse.Namespace) -> dict:
    if not SLUG.fullmatch(args.slug) or not 7 <= len(args.slug) <= 85:
        raise ValueError("Slug: 7-85 characters, lowercase words separated by dashes")
    title, description = args.title.strip(), args.description.strip()
    if not 12 <= len(title) <= 180 or not 30 <= len(description) <= 700:
        raise ValueError("Title or description outside editorial limits")
    if not args.source:
        raise ValueError("At least one authentic verified source is required")
    sources = [validated_source(s) for s in args.source]
    if len(sources) > 10:
        raise ValueError("At most 10 sources")
    for article in args.article:
        if not re.fullmatch(r"/actus/[a-z0-9-]{4,115}", article):
            raise ValueError("Article link must be an existing canonical SWAPP article path")
    seconds = probe(args.audio)
    if not args.audio_reviewed or not args.editorial_approved or not args.license_confirmed:
        raise PermissionError("Review of the actual audio, factual validation and speech rights are all mandatory")
    stamp = dt.datetime.now(tz=UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        "slug": args.slug,
        "title": title, "description": description,
        "audio": args.slug + ".mp3", "durationSec": seconds,
        "status": "published", "audioReviewed": True,
        "editorialApproved": True, "reviewedAt": stamp, "publishedAt": stamp,
        "sources": sources, "articles": sorted(set(args.article)),
    }


def run(args: argparse.Namespace) -> dict:
    episode = build_release(args)
    existing = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if existing.get("schema") != 1 or not isinstance(existing.get("episodes"), list):
        raise ValueError("Invalid SWAPP ON AIR manifest")
    if any(e.get("slug") == episode["slug"] for e in existing["episodes"]):
        raise FileExistsError("Slug already published; no silent replacement")
    dest = DESTINATION / episode["audio"]
    if dest.exists():
        raise FileExistsError("Destination MP3 already exists")
    output = {"episode": episode, "target": str(dest), "mode": "dry-run", "published": False}
    if not args.publish:
        return output
    # No remote POST or Git push. Only an explicit local action updates this repo.
    DESTINATION.mkdir(parents=True, exist_ok=True)
    temp_audio = dest.with_suffix(".incomplete")
    if temp_audio.exists():
        raise FileExistsError("Previous incomplete publication exists")
    try:
        shutil.copyfile(args.audio, temp_audio)
        if temp_audio.stat().st_size != args.audio.stat().st_size:
            raise IOError("Audio copy size mismatch")
        os.replace(temp_audio, dest)
        existing["episodes"].append(episode)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", prefix=".onair-", suffix=".json",
            dir=MANIFEST.parent, delete=False
        ) as temp_manifest:
            json.dump(existing, temp_manifest, ensure_ascii=False, indent=2)
            temp_manifest.write("\n")
            filename = temp_manifest.name
        os.replace(filename, MANIFEST)
    except Exception:
        if temp_audio.exists():
            temp_audio.unlink()
        # Never leave a released MP3 with no approved manifest entry.
        if dest.exists() and all(e.get("slug") != episode["slug"] for e in existing["episodes"][:-1]):
            dest.unlink()
        raise
    output["mode"] = "local-release-ready-to-commit"
    output["published"] = True
    output["next_step"] = "Commit MP3 and manifest, redeploy SWAPP, verify /on-air then listen."
    return output


def main() -> None:
    p = argparse.ArgumentParser(description="Release an approved, locally rendered SWAPP ON AIR MP3")
    p.add_argument("--audio", type=Path, required=True)
    p.add_argument("--slug", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--description", required=True)
    p.add_argument("--source", action="append", default=[])
    p.add_argument("--article", action="append", default=[])
    p.add_argument("--audio-reviewed", action="store_true")
    p.add_argument("--editorial-approved", action="store_true")
    p.add_argument("--license-confirmed", action="store_true")
    p.add_argument("--publish", action="store_true")
    args = p.parse_args()
    print(json.dumps(run(args), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
