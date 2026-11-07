#!/usr/bin/env python3
"""Design *French-first* podcast voices locally, then reuse them for full episodes.

Two-stage process, no Gemini or recurring TTS API:
  Qwen3-TTS 1.7B VoiceDesign -> French WAV anchors for NOVA and KERN
  Qwen3-TTS Base via swapp-on-air-qwen-local.py -> consistently voiced dialogue.

Dry-run is the default. Models are fetched only with --render --allow-download.
The anchors are fictional synthetic voices, not the historical Gemini Aoede
voice, and require a human listening test before use in any public episode.
"""
from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

# Disable dependency telemetry before any speech/ONNX library initializes.
os.environ.setdefault("ORT_DISABLE_TELEMETRY", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("DO_NOT_TRACK", "1")

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
ANCHORS = {
    "NOVA": (
        "Tiens, Kern, écoute ça... J'ai découvert un jeu qui pourrait vraiment nous surprendre. "
        "Mais attends, je vais te raconter.",
        "A natural adult French woman from metropolitan France speaking conversational French "
        "in a close-microphone gaming podcast. Native French pronunciation and liaisons; warm, "
        "amused and curious, quick subtle smiles, nuanced emphasis, little spontaneous pauses, "
        "a real human radio/podcast conversation, never a commercial, never a synthetic narrator. "
        "Medium pitch, full and clear voice, modern informal French register."
    ),
    "KERN": (
        "Attends, Nova, j'ai une question. On parle d'un jeu prometteur, d'accord... "
        "mais qu'est-ce qu'on sait vraiment ?",
        "A natural adult French man from metropolitan France talking in a casual French gaming "
        "podcast. Native French vowels and consonants, slightly lower pitch, warm but discerning, "
        "dry humor, relaxed phrasing, natural breathing, gentle hesitation and skeptical curiosity. "
        "He sounds like a real co-host replying to a friend, not a news anchor or audiobook narrator."
    ),
}


def plan(args: argparse.Namespace) -> dict:
    if args.clone_size not in ("light", "standard"):
        raise ValueError("Invalid clone model size")
    return {
        "mode": "french_voice_design_and_clone",
        "voice_model": MODEL,
        "clone_model": "Qwen/Qwen3-TTS-12Hz-"
                       + ("0.6B" if args.clone_size == "light" else "1.7B") + "-Base",
        "voices": {"NOVA": "original French synthetic voice", "KERN": "original French synthetic voice"},
        "local_only_inference": True,
        "does_not_match_historical_aoede": True,
        "automatically_published": False,
        "model_download_allowed": bool(args.allow_download),
        "render_requested": bool(args.render),
        "audio_generated": False,
        "note": "Both generated voices must be approved by listening before publication.",
    }


def render(args: argparse.Namespace) -> None:
    """Create French voice anchors once, then resume an interrupted dialogue."""
    root = Path(args.output).expanduser().resolve()
    if root.suffix.lower() != ".wav":
        raise ValueError("Output must be WAV; the clone script encodes MP3")
    anchors_dir = root.parent / (root.stem + "-reference-voices")
    if root.exists() or root.with_suffix(".mp3").exists():
        raise FileExistsError("Recorded audio already exists. Use --encode-only if only MP3 is missing.")
    root.parent.mkdir(parents=True, exist_ok=True)
    required = [
        anchors_dir / (key.lower() + suffix)
        for key in ANCHORS for suffix in (".wav", ".txt")
    ]
    if anchors_dir.exists():
        if not all(p.is_file() and p.stat().st_size > (20000 if p.suffix == ".wav" else 10)
                   for p in required):
            raise RuntimeError("Incomplete reference voices; no files erased. Review the voice directory.")
        print("Reusing completed NOVA/KERN reference voices; no voice-design model reload.", flush=True)
    else:
        if not args.allow_download:
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"
        import numpy as np
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
        if not torch.cuda.is_available() and not args.allow_cpu:
            raise RuntimeError("No CUDA GPU. Use --allow-cpu only if slow local generation is acceptable.")
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if device != "cpu" else torch.float32
        model = Qwen3TTSModel.from_pretrained(MODEL, device_map=device, dtype=dtype)
        generated = {}
        for key, (speech, instruction) in ANCHORS.items():
            waves, sr = model.generate_voice_design(text=speech, language="French", instruct=instruction)
            wave = np.asarray(waves[0], dtype=np.float32).squeeze()
            if wave.ndim != 1 or not np.all(np.isfinite(wave)) or wave.size < int(sr * 2):
                raise RuntimeError("Invalid or truncated generated reference voice: " + key)
            generated[key] = (wave, int(sr), speech)
        del model
        if device != "cpu":
            torch.cuda.empty_cache()
        # Write reference voices to a temporary directory first; an
        # interrupted render cannot leave corrupt final voice anchors.
        import tempfile
        import shutil
        temporary = Path(tempfile.mkdtemp(prefix=".on-air-voices-", dir=root.parent))
        try:
            for key, (wave, sr, speech) in generated.items():
                sf.write(str(temporary / (key.lower() + ".wav")), wave, sr, subtype="PCM_16")
                (temporary / (key.lower() + ".txt")).write_text(speech, encoding="utf-8")
            temporary.rename(anchors_dir)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary, ignore_errors=True)
        print("NOVA/KERN original French voice anchors are complete.", flush=True)
    runner = Path(__file__).resolve().with_name("swapp-on-air-qwen-local.py")
    cmd = [sys.executable, str(runner), "--episode", str(args.episode),
           "--mode", "clone", "--size", args.clone_size, "--render",
           "--authorized-reference",
           "--reference-nova", str(anchors_dir / "nova.wav"),
           "--reference-kern", str(anchors_dir / "kern.wav"),
           "--transcript-nova", str(anchors_dir / "nova.txt"),
           "--transcript-kern", str(anchors_dir / "kern.txt"),
           "--output", str(root)]
    if args.allow_download:
        cmd.append("--allow-download")
    if args.allow_cpu:
        cmd.append("--allow-cpu")
    subprocess.run(cmd, check=True)
    print(json.dumps({
        "wav": str(root), "mp3_if_ffmpeg": str(root.with_suffix(".mp3")),
        "voice_references": str(anchors_dir),
        "published": False, "requires_listening_review": True
    }, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="PODCAST — native-French Qwen voice design + stable cloning")
    parser.add_argument("--episode", default="data/swapp-on-air/voice-natural-demo.json")
    parser.add_argument("--output", default=".swapp-on-air-private/nova-kern-designed.wav")
    parser.add_argument("--clone-size", choices=("light", "standard"), default="standard")
    parser.add_argument("--render", action="store_true", help="Generate actual voice references and the pilot")
    parser.add_argument("--allow-download", action="store_true", help="Authorize initial open-model downloads")
    parser.add_argument("--allow-cpu", action="store_true", help="Explicitly allow slow CPU rendering")
    args = parser.parse_args()
    print(json.dumps(plan(args), ensure_ascii=False, indent=2))
    if not args.render:
        print("Dry run: no network, no model loaded, no audio created.")
        return
    render(args)


if __name__ == "__main__":
    main()
