#!/usr/bin/env python3
"""Publishable Mairaiy/Aoede narration, generated on demand by an OPERATOR, never by website visitors.

Reuses the existing Quantic Studio historical voice route; does NOT substitute Kokoro,
Windows or browser voices. Requires an explicit --approve-provider-usage because
Gemini TTS can consume quota and may cost money. No credentials embedded in Git.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import wave
from pathlib import Path

SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,108})[a-z0-9]$")
PROFILE = "mairaiy-gemini-aoede"
ENGINE = "gemini-tts"
VOICE = "Aoede"
MODEL = "gemini-3.1-flash-tts-preview"
MAX_CHARS = 350
MAX_REQUESTS = 140
MAX_RESPONSE_BYTES = 1_500_000


def reuse_swapp_markdown():
    file = Path(__file__).with_name("swapp-narration-generate.py")
    spec = importlib.util.spec_from_file_location("swapp_narration_helper", file)
    if spec is None or spec.loader is None:
        raise RuntimeError("SWAPP article parser unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def split_transcript(text):
    """Maximum 350 characters: Quantic Studio currently trims each source to 430."""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= MAX_CHARS:
        return [text] if text else []
    sentences = re.findall(r"[^.!?…]+[.!?…]+|[^.!?…]+$", text)
    chunks, piece = [], ""
    for sentence in sentences:
        for word in sentence.split():
            proposed = (piece + " " + word).strip()
            if len(proposed) > MAX_CHARS and piece:
                chunks.append(piece)
                piece = word
            else:
                piece = proposed
            if len(piece) > MAX_CHARS:
                raise ValueError("Single word exceeds 350 characters")
    if piece:
        chunks.append(piece)
    return chunks


def service_origin(raw):
    url = urllib.parse.urlsplit(raw)
    if url.scheme not in ("https", "http") or not url.hostname:
        raise ValueError("Valid Quantic Studio service URL required")
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("Service must be an origin only (no credentials, query or path)")
    local = url.hostname in ("localhost", "127.0.0.1", "::1")
    if url.scheme != "https" and not local:
        raise ValueError("Remote Mairaiy service requires HTTPS")
    return raw.rstrip("/")


def request_json(url, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data,
         headers={"Accept": "application/json" if payload is None else "audio/wav",
                  **({"Content-Type": "application/json"} if data is not None else {}),
                  **(headers or {})},
         method="GET" if payload is None else "POST")
    with urllib.request.urlopen(req, timeout=45) as response:
        length = int(response.headers.get("Content-Length") or 0)
        if length > MAX_RESPONSE_BYTES:
            raise RuntimeError("Mairaiy service response too large")
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise RuntimeError("Mairaiy service response too large")
        return body, response.headers


def verify_voice_discovery(origin, headers):
    raw, _ = request_json(origin + "/voice/.well-known/voicestudio-speech", headers=headers)
    try:
        profile = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise RuntimeError("Mairaiy service returned invalid discovery JSON") from exc
    if not isinstance(profile, dict) or not profile.get("ready") or not (
        profile.get("engine") == ENGINE
        and profile.get("engine_voice") == VOICE
        and profile.get("model") == MODEL
        and profile.get("language") == "fr-fr"
        and profile.get("historical_profile") == "aura-live-2.0.7-natural"
        and profile.get("generic_tts_fallback") is False
    ):
        raise RuntimeError("Historical Mairaiy/Aoede service not available or voice identity mismatch")


def render_wav(origin, text, headers):
    payload = {
        "model": MODEL, "input": text, "voice": PROFILE,
        "response_format": "wav", "speed": 1.0,
        "language": "fr-fr", "engine_voice": VOICE,
    }
    body, metadata = request_json(origin + "/voice/v1/audio/speech", payload=payload, headers=headers)
    if metadata.get("X-Mairaiy-Voice") != VOICE or (
        metadata.get("X-Mairaiy-Engine") != ENGINE or
        metadata.get("X-Mairaiy-Language") != "fr-fr" or
        metadata.get("X-Mairaiy-Historical-Profile") != "aura-live-2.0.7-natural"
    ):
        raise RuntimeError("Audio response is not historical Mairaiy/Aoede; aborting without fallback")
    if body[:4] != b"RIFF":
        raise RuntimeError("Expected WAV RIFF response from Quantic Studio")
    with wave.open(io.BytesIO(body), "rb") as item:
        props = (item.getnchannels(), item.getsampwidth(), item.getframerate())
        if props[0] != 1 or props[1] != 2 or not (16000 <= props[2] <= 48000):
            raise RuntimeError("Mairaiy returned unsupported WAV profile")
        return item.readframes(item.getnframes()), props


def generate(article, slug, origin, directory, headers):
    helper = reuse_swapp_markdown()
    blocks = helper.validate_article(article, slug)
    chapter_chunks = [split_transcript(b) for b in blocks]
    requests = sum(map(len, chapter_chunks))
    if not 1 <= requests <= MAX_REQUESTS:
        raise ValueError("Too many narration requests; split article into smaller articles first")
    # All validation and explicit budget information precede the first paid call.
    print(f"Mairaiy/Aoede will require {requests} synthesis calls for {len(blocks)} paragraphs.",file=sys.stderr)
    verify_voice_discovery(origin, headers)
    target = directory / slug
    target.mkdir(parents=True, exist_ok=True)
    markers, seconds = [], 0.0
    settings = None
    with tempfile.TemporaryDirectory(prefix="swapp-mairaiy-", dir=target) as folder:
        folder = Path(folder)
        wav_file = folder / "audio.wav"
        try:
            output = wave.open(str(wav_file), "wb")
            with output:
                for index, (text, passages) in enumerate(zip(blocks,chapter_chunks), 1):
                    start = seconds
                    for passage in passages:
                        audio, spec = render_wav(origin, passage, headers)
                        if settings is None:
                            settings=spec
                            output.setnchannels(spec[0])
                            output.setsampwidth(spec[1])
                            output.setframerate(spec[2])
                        elif spec != settings:
                            raise RuntimeError("Mairaiy output changed audio format within one article")
                        output.writeframes(audio)
                        seconds += len(audio)/(spec[0]*spec[1]*spec[2])
                    markers.append({"text": text,"start":round(start,3),"end":round(seconds,3)})
                    print(f"Block {index}/{len(blocks)}",file=sys.stderr)
        except Exception:
            # Do not publish incomplete audio, metadata, or unverified fallback.
            raise
        resulting_file = wav_file
        if shutil.which("ffmpeg"):
            mp3 = folder/"audio.mp3"
            subprocess.run(["ffmpeg","-nostdin","-y","-hide_banner","-loglevel","error",
                            "-i",str(wav_file),"-codec:a","libmp3lame","-b:a","96k",str(mp3)],
                           check=True,timeout=300)
            resulting_file = mp3
        destination = target/resulting_file.name
        shutil.copy2(resulting_file,destination)
        manifest = {
            "version":1,"slug":slug,"language":"fr-FR",
            "engine": ENGINE, "voice": PROFILE, "engine_voice": VOICE,
            "model":MODEL, "historical_profile":"aura-live-2.0.7-natural",
            "audio":resulting_file.name, "duration":round(seconds,3),
            "blocks": markers, "audio_sha256":hashlib.sha256(destination.read_bytes()).hexdigest(),
        }
        temporary = target/"manifest.json.tmp"
        temporary.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
        temporary.replace(target/"manifest.json")
    return target


def main():
    parser=argparse.ArgumentParser(description="Generate TRUE Mairaiy voice audiobook from existing Quantic Studio Aoede service")
    parser.add_argument("--slug",required=True)
    parser.add_argument("--service",required=True,help="Already configured Quantic Studio HTTPS origin, or local 127.0.0.1")
    parser.add_argument("--json",type=Path,help="Explicit local published article JSON (else fetch public SWAPP)")
    parser.add_argument("--output",type=Path,default=Path(__file__).resolve().parent.parent/"assets/swapp-narrations")
    parser.add_argument("--approve-provider-usage",action="store_true",help="Required: generation may use Gemini paid quota")
    args=parser.parse_args()
    if not SLUG.fullmatch(args.slug):
        parser.error("Invalid article slug")
    if not args.approve_provider_usage:
        parser.error("Explicit --approve-provider-usage is required; Gemini TTS can consume paid quota")
    try:
        origin=service_origin(args.service)
        helper=reuse_swapp_markdown()
        article=json.loads(args.json.read_text(encoding="utf-8")) if args.json else helper.fetch_published(args.slug)
        token=os.getenv("SWAPP_MAIRAIY_PRODUCER_TOKEN","").strip()
        headers={"Authorization":"Bearer "+token} if token else {}
        directory=generate(article,args.slug,origin,args.output.resolve(),headers)
        print("Generated exact Mairaiy/Aoede narration:",directory)
        print("Upload AUDIO FIRST and manifest.json LAST via existing Hostinger FTP.")
    except (ValueError,OSError,RuntimeError,urllib.error.URLError,subprocess.CalledProcessError) as exc:
        parser.exit(1,"Mairaiy narration not published: "+str(exc)+"\n")

if __name__=="__main__":
    main()
