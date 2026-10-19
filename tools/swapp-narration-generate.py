#!/usr/bin/env python3
"""Generate French neural audiobook files OFFLINE with Kokoro. Nothing runs on Hostinger.

Example:
 python tools/swapp-narration-generate.py --slug un-article-publie

Requirements on producer machine: Python, kokoro, torch, numpy, soundfile,
espeak-ng and optionally ffmpeg. Hosting only serves static MP3/WAV + JSON.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,108})[a-z0-9]$")
HEADING = re.compile(r"^(#{2,3})\s+(.+)$")
BULLET = re.compile(r"^[-*]\s+(.+)$")
QUOTE = re.compile(r"^>\s?(.+)$")
STRONG = re.compile(r"\*\*(.+?)\*\*")
ITALIC = re.compile(r"\*(.+?)\*")


def plain(s):
    return re.sub(r"\s+", " ", ITALIC.sub(r"\1", STRONG.sub(r"\1", s))).strip()


def blocks_from_markdown(markdown):
    """Mirror the native SWAPP Markdown renderer's heading/paragraph/list order."""
    output, paragraph, listing = [], [], []

    def flush_paragraph():
        if paragraph:
            output.append(plain(" ".join(paragraph)))
            paragraph.clear()

    def flush_list():
        if listing:
            output.extend(plain(item) for item in listing)
            listing.clear()

    for raw in str(markdown or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line:
            flush_paragraph()
            flush_list()
            continue
        heading, bullet, quote = HEADING.match(line), BULLET.match(line), QUOTE.match(line)
        if heading:
            flush_paragraph()
            flush_list()
            output.append(plain(heading.group(2)))
        elif bullet:
            flush_paragraph()
            listing.append(bullet.group(1))
        elif quote:
            flush_paragraph()
            flush_list()
            output.append(plain(quote.group(1)))
        else:
            flush_list()
            paragraph.append(line)
    flush_paragraph()
    flush_list()
    return [entry for entry in output if entry]


def fetch_published(slug):
    url = "https://swapp.tv/api/actus/" + slug
    request = urllib.request.Request(url, headers={
        "Accept": "application/json", "User-Agent": "SWAPP-Narration-Offline/1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        if int(response.headers.get("Content-Length") or 0) > 1_048_576:
            raise ValueError("Source article is too large")
        data = response.read(1_048_577)
    if len(data) > 1_048_576:
        raise ValueError("Source article is too large")
    return json.loads(data)


def validate_article(data, slug):
    if not isinstance(data, dict) or data.get("slug") != slug:
        raise ValueError("Article slug mismatch")
    if data.get("status") not in (None, "published"):
        raise ValueError("Article is not published")
    body = data.get("body")
    if not isinstance(body, str) or not 80 <= len(body) <= 30000:
        raise ValueError("Article text must be between 80 and 30000 characters")
    blocks = blocks_from_markdown(body)
    if not blocks or len(blocks) > 300:
        raise ValueError("No narration text or too many blocks")
    return blocks


def produce(blocks, slug, output_dir, speed, wav_only=False):
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except ImportError as exc:
        raise RuntimeError("Install kokoro, torch, numpy and soundfile on the producer machine") from exc
    if not shutil.which("espeak-ng"):
        raise RuntimeError("espeak-ng is required for French phonemization, on the producer machine")
    pipeline = KPipeline(lang_code="f")
    rate = 24000
    silence = np.zeros(int(rate * 0.18), dtype=np.float32)
    chunks, markers, seconds = [], [], 0.0
    for index, text in enumerate(blocks):
        start = seconds
        samples = []
        for _, _, audio in pipeline(text, voice="ff_siwis", speed=speed, split_pattern=r"\n+"):
            samples.append(np.asarray(audio, dtype=np.float32))
        if not samples:
            raise RuntimeError("No audio produced for block " + str(index + 1))
        block = np.concatenate(samples)
        if not np.isfinite(block).all() or not len(block):
            raise RuntimeError("Invalid neural audio samples")
        chunks.append(block)
        seconds += len(block) / rate
        markers.append({"text": text, "start": round(start, 3), "end": round(seconds, 3)})
        chunks.append(silence)
        seconds += len(silence) / rate
        print(f"{index+1}/{len(blocks)} · {len(text)} characters", file=sys.stderr)
    target = output_dir / slug
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="swapp-narration-", dir=target) as temporary:
        temp = Path(temporary)
        wav = temp / "audio.wav"
        sf.write(wav, np.concatenate(chunks), rate, subtype="PCM_16")
        result = wav
        if not wav_only and shutil.which("ffmpeg"):
            mp3 = temp / "audio.mp3"
            subprocess.run(["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
                            "-i", str(wav), "-ar", "24000", "-b:a", "96k", str(mp3)],
                           check=True, timeout=180)
            result = mp3
        destination = target / result.name
        shutil.copy2(result, destination)
        manifest = {
            "version": 1, "slug": slug, "language": "fr-FR",
            "voice": "ff_siwis", "engine": "kokoro-82m-v1.0",
            "audio": result.name, "duration": round(seconds, 3),
            "blocks": markers,
            "audio_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        }
        temporary_json = temp / "manifest.json"
        temporary_json.write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        shutil.copy2(temporary_json, target / "manifest.json.tmp")
        (target / "manifest.json.tmp").replace(target / "manifest.json")
    return target


def main():
    parser = argparse.ArgumentParser(description="SWAPP free offline neural French narration")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--json", type=Path, help="Local published article JSON instead of SWAPP API")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "assets/swapp-narrations")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--wav-only", action="store_true")
    args = parser.parse_args()
    if not SLUG.fullmatch(args.slug):
        parser.error("Invalid article slug")
    if not 0.8 <= args.speed <= 1.25:
        parser.error("Speed must be between 0.8 and 1.25")
    try:
        article = json.loads(args.json.read_text(encoding="utf-8")) if args.json else fetch_published(args.slug)
        blocks = validate_article(article, args.slug)
        output = produce(blocks, args.slug, args.output.resolve(), args.speed, args.wav_only)
        print("Generated:", output)
        print("Upload this folder over FTP to Hostinger assets/swapp-narrations/")
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        parser.exit(1, "Narration failed: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
