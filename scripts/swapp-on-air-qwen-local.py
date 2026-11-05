#!/usr/bin/env python3
"""SWAPP ON AIR — expressive French dialogue, rendered offline with Qwen3-TTS.

No Google AI Studio, no paid API, no background production. The first run can
download model weights from Hugging Face ONLY after explicit --allow-download.
Without --render, the script prints the plan without importing Torch or Qwen.
"""
from __future__ import annotations
import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

VOICE_PROFILES = {
    "NOVA": {
        "speaker": "Serena",
        "instruction": (
            "Speak native French from France. An adult woman hosting a close-mic gaming conversation: "
            "warm, alert, genuinely curious, lively but never an announcer, subtle smile and natural breaths. "
            "React to the other host instead of reciting a news bulletin."
        ),
    },
    "KERN": {
        "speaker": "Ryan",
        "instruction": (
            "Speak native French from France. An adult man in a relaxed podcast discussion: "
            "thoughtful, gently ironic, grounded, with dry comic timing and natural conversational pauses. "
            "Never sound like an advertisement, audiobook, or monotonous news reader."
        ),
    },
}
ALLOWED_MODELS = {
    ("custom", "standard"): "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    ("custom", "light"): "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    ("clone", "standard"): "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    ("clone", "light"): "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
}


def load_episode(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("publication_allowed") is not False:
        raise ValueError("Pilot must explicitly have publication_allowed=false")
    turns = payload.get("segments")
    if not isinstance(turns, list) or not 2 <= len(turns) <= 80:
        raise ValueError("Pilot requires between 2 and 80 dialogue turns")
    for n, turn in enumerate(turns, 1):
        if turn.get("speaker") not in VOICE_PROFILES:
            raise ValueError(f"Unknown speaker on line {n}")
        text = turn.get("text")
        if not isinstance(text, str) or not 3 <= len(text.strip()) <= 350:
            raise ValueError(f"Invalid text length on line {n}")
        if not isinstance(turn.get("delivery", ""), str) or len(turn.get("delivery", "")) > 180:
            raise ValueError(f"Invalid acting instruction on line {n}")
    return payload


def plan(episode: dict, mode: str, size: str) -> dict:
    return {
        "title": episode.get("title", "SWAPP ON AIR"),
        "turns": len(episode["segments"]),
        "models": [ALLOWED_MODELS[(mode, size)]],
        "mode": mode,
        "voices": ["NOVA", "KERN"],
        "french": True,
        "offline_inference": True,
        "acting_instructions_supported": mode == "custom" and size == "standard",
        "french_accent_requires_listening": True,
        "publication_allowed": False,
        "generates_audio": False,
        "warning": "Quality and fidelity must be approved by listening; no naturalness guarantee.",
    }


def render(episode: dict, args: argparse.Namespace) -> tuple[Path, Path | None]:
    # Imported only during an intentional render; --check is lightweight.
    if not args.allow_download:
        # Set before model libraries load: HF_HUB_OFFLINE is read at import time.
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    if not torch.cuda.is_available() and not args.allow_cpu:
        raise RuntimeError("No CUDA GPU. CPU can be very slow; rerun explicitly with --allow-cpu.")

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device != "cpu" and torch.cuda.is_bf16_supported() else (
        torch.float16 if device != "cpu" else torch.float32
    )
    model_id = ALLOWED_MODELS[(args.mode, args.size)]
    model = Qwen3TTSModel.from_pretrained(model_id, device_map=device, dtype=dtype)

    prompts = {}
    if args.mode == "clone":
        if not args.authorized_reference:
            raise ValueError("Only authorized voice samples may be cloned: --authorized-reference required.")
        for speaker, path, transcript in (
            ("NOVA", args.reference_nova, args.transcript_nova),
            ("KERN", args.reference_kern, args.transcript_kern),
        ):
            if not path or not transcript:
                raise ValueError("Clone mode requires both WAV references and exact transcripts.")
            wav_path = Path(path).expanduser().resolve()
            if not wav_path.is_file() or wav_path.suffix.lower() != ".wav":
                raise ValueError(f"Missing WAV file for {speaker}")
            text_path = Path(transcript).expanduser().resolve()
            if not text_path.is_file() or not text_path.read_text(encoding="utf-8").strip():
                raise ValueError(f"Missing reference transcript for {speaker}")
            prompts[speaker] = model.create_voice_clone_prompt(
                ref_audio=str(wav_path), ref_text=text_path.read_text(encoding="utf-8").strip(),
                x_vector_only_mode=False
            )

    pieces = []
    sample_rate = None
    # Each line is performed separately; role labels/instructions must NEVER be spoken.
    # Joining with small gaps creates dialogue timing without robotic paragraph reading.
    for i, turn in enumerate(episode["segments"], 1):
        speaker = turn["speaker"]
        words = turn["text"].strip().replace("\r", " ").replace("\n", " ")
        if args.mode == "clone":
            waveforms, sr = model.generate_voice_clone(
                text=words, language="French", voice_clone_prompt=prompts[speaker]
            )
        else:
            profile = VOICE_PROFILES[speaker]
            instruction = profile["instruction"]
            if args.size == "standard" and turn.get("delivery"):
                instruction += " Acting intention for this line: " + turn["delivery"].strip()
            # Qwen3-TTS 0.6B CustomVoice explicitly ignores 'instruct'. Do not
            # misrepresent the smaller model as expressive/actor-directed.
            waveforms, sr = model.generate_custom_voice(
                text=words, language="French", speaker=profile["speaker"],
                instruct=instruction if args.size == "standard" else ""
            )
        audio = np.asarray(waveforms[0], dtype=np.float32).squeeze()
        if audio.ndim != 1 or audio.size < int(sr * 0.20) or not np.all(np.isfinite(audio)):
            raise RuntimeError(f"Invalid or truncated audio at dialogue line {i}")
        if sample_rate is not None and int(sr) != sample_rate:
            raise RuntimeError("Speech model unexpectedly changed sample rate")
        sample_rate = int(sr)
        # Gentle level alignment; avoid peaks clipping at edit points.
        rms = float(np.sqrt(np.mean(audio * audio)))
        if rms < 0.0002:
            raise RuntimeError(f"Silent output on dialogue line {i}")
        gain = min(2.0, 0.12 / rms)
        peak = float(np.max(np.abs(audio)))
        gain = min(gain, 0.95 / max(peak, 0.001))
        audio = audio * gain
        fade = min(int(sr * .012), audio.size // 6)
        if fade:
            audio[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)
            audio[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
        pieces.append(audio)
        # A different duration for questions and declarative lines sounds more human.
        if i < len(episode["segments"]):
            gap = 0.18 if words.endswith("?") else 0.22 if words.endswith("!") else 0.24
            pieces.append(np.zeros(round(sr * gap), dtype=np.float32))
        print(f"Rendered {speaker} {i}/{len(episode['segments'])}: {audio.size / sr:.1f} s", flush=True)

    if not pieces or not sample_rate:
        raise RuntimeError("Nothing rendered")
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() or output.with_suffix(".mp3").exists():
        raise FileExistsError("Existing render found; choose another --output file to protect prior takes")
    sf.write(str(output), np.concatenate(pieces), sample_rate, subtype="PCM_16")
    return output, encode_existing_wav(output)


def encode_existing_wav(output: Path) -> Path:
    """Encode a completed WAV without loading Qwen or regenerating dialogue."""
    if not output.is_file() or output.suffix.lower() != ".wav" or output.stat().st_size < 20000:
        raise FileNotFoundError("A complete WAV recording is required for MP3 conversion")
    mp3 = output.with_suffix(".mp3")
    if mp3.exists():
        raise FileExistsError("MP3 already exists; keeping the original recording")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except (ImportError, RuntimeError, OSError):
            ffmpeg = None
    if not ffmpeg:
        raise RuntimeError("Install imageio-ffmpeg to encode a real MP3, no paid service needed")
    try:
        subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-n", "-i", str(output),
             "-codec:a", "libmp3lame", "-qscale:a", "3", str(mp3)],
            check=True, timeout=240,
        )
        if not mp3.is_file() or mp3.stat().st_size < 30000:
            raise RuntimeError("MP3 encoding produced an invalid or incomplete output")
    except Exception:
        if mp3.exists():
            mp3.unlink()
        raise
    return mp3


def main() -> None:
    parser = argparse.ArgumentParser(description="SWAPP ON AIR natural-voice local pilot (no paid API)")
    parser.add_argument("--episode", type=Path, default=Path("data/swapp-on-air/voice-natural-demo.json"))
    parser.add_argument("--mode", choices=("custom", "clone"), default="custom")
    parser.add_argument("--size", choices=("light", "standard"), default="standard")
    parser.add_argument("--render", action="store_true", help="Intentionally load model and generate audio")
    parser.add_argument("--encode-only", action="store_true",
                        help="Resume from an existing WAV; only encode the MP3, without any TTS model")
    parser.add_argument("--allow-download", action="store_true", help="Allow initial open-model download from Hugging Face")
    parser.add_argument("--allow-cpu", action="store_true", help="Allow potentially very slow CPU generation")
    parser.add_argument("--authorized-reference", action="store_true", help="Confirm lawful consent for both voice-clone references")
    parser.add_argument("--reference-nova", default="")
    parser.add_argument("--reference-kern", default="")
    parser.add_argument("--transcript-nova", default="")
    parser.add_argument("--transcript-kern", default="")
    parser.add_argument("--output", default=".swapp-on-air-private/nova-kern-natural.wav")
    args = parser.parse_args()
    episode = load_episode(args.episode)
    if args.encode_only:
        output = Path(args.output).expanduser().resolve()
        mp3 = encode_existing_wav(output)
        print(json.dumps({"wav": str(output), "mp3": str(mp3),
                          "reused_audio": True, "published": False}, ensure_ascii=False))
        return
    print(json.dumps(plan(episode, args.mode, args.size), ensure_ascii=False, indent=2))
    if not args.render:
        print("Dry run only: no model loaded, no network request, no audio file created.")
        return
    # Enforce rights/inputs before an expensive model load.
    if args.mode == "clone" and (not args.authorized_reference or
        not all((args.reference_nova, args.reference_kern, args.transcript_nova, args.transcript_kern))):
        raise ValueError("Clone mode requires --authorized-reference, two reference WAVs and two exact transcripts")
    out = Path(args.output).expanduser().resolve()
    if out.exists() or out.with_suffix(".mp3").exists():
        raise FileExistsError("Output already exists: select another destination before model loading")
    wav, mp3 = render(episode, args)
    print(json.dumps({"wav":str(wav), "mp3":str(mp3) if mp3 else None,
        "published":False, "review_required":True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
