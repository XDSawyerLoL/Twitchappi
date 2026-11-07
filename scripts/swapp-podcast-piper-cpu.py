#!/usr/bin/env python3
"""Local SWAPP PODCAST neural French two-speaker renderer (Piper CPU).
No paid API, no overwrite, no publication. Python 3.10+.
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

VOICE_NAMES = {"NOVA": "fr_FR-siwis-medium", "KERN": "fr_FR-tom-medium"}

def validate_episode(filename):
    episode = json.loads(Path(filename).read_text(encoding="utf-8"))
    if episode.get("publication_allowed") is not False:
        raise ValueError("Only a non-publishable draft can be rendered")
    turns = episode.get("segments")
    if not isinstance(turns, list) or not 2 <= len(turns) <= 80:
        raise ValueError("Expected 2 to 80 dialogue turns")
    for i, turn in enumerate(turns, 1):
        if turn.get("speaker") not in VOICE_NAMES:
            raise ValueError(f"Bad speaker on turn {i}")
        words = turn.get("text")
        if not isinstance(words, str) or not 3 <= len(words.strip()) <= 350:
            raise ValueError(f"Bad speech on turn {i}")
        pause = turn.get("pause_after_ms", 180)
        if type(pause) is not int or not 60 <= pause <= 900:
            raise ValueError(f"Bad pause on turn {i}")
    return turns

def check_voice_files(folder):
    for key in VOICE_NAMES.values():
        path = folder / (key + ".onnx")
        if not path.is_file() or not Path(str(path) + ".json").is_file():
            raise FileNotFoundError(f"Missing {key}; run with --download-voices (network required)")
        if path.stat().st_size < 1_000_000:
            raise ValueError(f"Voice model seems incomplete: {path}")

def synthesize(turns, folder, output):
    if output.suffix.lower() != ".mp3":
        raise ValueError("Output must be MP3")
    if output.exists():
        raise FileExistsError("Refusing to overwrite existing audio")
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found")
    from piper import PiperVoice
    voices = {speaker: PiperVoice.load(str(folder / (name + ".onnx")))
              for speaker, name in VOICE_NAMES.items()}
    with tempfile.TemporaryDirectory(prefix="swapp-podcast-") as tmp:
        work = Path(tmp)
        entries = []
        for i, turn in enumerate(turns):
            wav = work / f"{i:03d}.wav"
            with wave.open(str(wav), "wb") as handle:
                voices[turn["speaker"]].synthesize_wav(turn["text"].strip(), handle)
            with wave.open(str(wav), "rb") as handle:
                if handle.getnframes() < 1000 or handle.getnchannels() != 1:
                    raise ValueError(f"Invalid generated audio on turn {i+1}")
            entries.append((wav, turn.get("pause_after_ms", 180)))
            print(f"Voix {i+1}/{len(turns)} : {turn['speaker']}", flush=True)
        # Re-sample independently and concatenate in chronological order.
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
        num_inputs = 0
        for i, (wav, pause) in enumerate(entries):
            command += ["-i", str(wav)]
            num_inputs += 1
            if i < len(entries) - 1:
                command += ["-f", "lavfi", "-t", str(pause / 1000),
                            "-i", "anullsrc=r=24000:cl=mono"]
                num_inputs += 1
        filters = "".join(f"[{i}:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[a{i}];"
                          for i in range(num_inputs))
        filters += "".join(f"[a{i}]" for i in range(num_inputs))
        filters += f"concat=n={num_inputs}:v=0:a=1[out]"
        candidate = work / "new-episode.mp3"
        subprocess.run(command + ["-filter_complex", filters, "-map", "[out]",
                                   "-codec:a", "libmp3lame", "-b:a", "160k", str(candidate)],
                       check=True, timeout=300)
        if candidate.stat().st_size < 30_000:
            raise RuntimeError("Invalid final MP3")
        output.parent.mkdir(parents=True, exist_ok=True)
        candidate.replace(output)
    return output

def main():
    p = argparse.ArgumentParser(description="SWAPP PODCAST Piper CPU, never publishes")
    p.add_argument("--episode", default="data/swapp-on-air/episode-pikmin-20261105.json")
    p.add_argument("--voice-dir", type=Path, default=Path(".swapp-on-air-private/piper-voices"))
    p.add_argument("--output", type=Path,
                   default=Path(".swapp-on-air-private/swapp-podcast-pikmin-piper-v1.mp3"))
    p.add_argument("--download-voices", action="store_true",
                   help="Explicitly download two public French voice models (~130 MB)")
    p.add_argument("--render", action="store_true", help="Generate new MP3 locally")
    args = p.parse_args()
    turns = validate_episode(args.episode)
    if args.download_voices:
        args.voice_dir.mkdir(parents=True, exist_ok=True)
        subprocess.run([sys.executable, "-m", "piper.download_voices",
                        *VOICE_NAMES.values(), "--data-dir", str(args.voice_dir)], check=True)
    if not args.render:
        print(json.dumps({"turns": len(turns), "published": False, "audio_generated": False,
                          "voice_directory": str(args.voice_dir)}, ensure_ascii=False))
        return
    check_voice_files(args.voice_dir)
    file = synthesize(turns, args.voice_dir, args.output)
    print(json.dumps({"mp3": str(file), "turns": len(turns), "published": False,
                      "human_listening_required": True}, ensure_ascii=False))

if __name__ == "__main__":
    main()
