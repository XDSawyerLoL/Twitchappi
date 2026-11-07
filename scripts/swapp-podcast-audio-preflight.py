#!/usr/bin/env python3
"""Offline technical preflight for a newly rendered SWAPP PODCAST WAV.

This is NOT a listening, transcript, factual, or editorial approval.
It never uploads or modifies the source recording.
"""
from __future__ import annotations

import argparse
import array
import json
import math
import sys
import wave
from pathlib import Path


def inspect_wav(path: Path) -> dict:
    if not path.is_file():
        raise ValueError("WAV file not found")
    with wave.open(str(path), "rb") as wav:
        channels, width, rate = wav.getnchannels(), wav.getsampwidth(), wav.getframerate()
        frames = wav.getnframes()
        if channels != 1 or width != 2 or rate < 16000 or rate > 96000:
            raise ValueError("Expected mono 16-bit PCM WAV at 16–96 kHz")
        if frames == 0:
            raise ValueError("Empty WAV")
        duration = frames / rate
        if duration < 10:
            raise ValueError("Recording is shorter than 10 seconds")
        samples_seen, squares, peak, clipped = 0, 0.0, 0, 0
        quiet_run, longest_quiet = 0, 0
        # Scan in chunks: never load entire podcast into memory.
        while True:
            chunk = wav.readframes(32768)
            if not chunk:
                break
            values = array.array("h")
            values.frombytes(chunk)
            if sys.byteorder != "little":
                values.byteswap()
            for sample in values:
                magnitude = abs(sample)
                peak = max(peak, magnitude)
                squares += float(sample) * sample
                clipped += magnitude >= 32760
                samples_seen += 1
                if magnitude < 100:
                    quiet_run += 1
                    longest_quiet = max(longest_quiet, quiet_run)
                else:
                    quiet_run = 0
        if samples_seen != frames:
            raise ValueError("WAV frame count mismatch")
    rms = math.sqrt(squares / samples_seen) / 32768.0
    peak_ratio = peak / 32768.0
    silence_s = longest_quiet / rate
    clipping_percent = 100.0 * clipped / samples_seen
    checks = {
        "duration": duration >= 10.0,
        "audible_signal": rms >= 0.004,
        "no_sustained_silence_over_5s": silence_s <= 5.0,
        "no_excess_clipping": clipping_percent < 0.10,
    }
    return {
        "file": str(path), "duration_sec": round(duration, 2), "sample_rate": rate,
        "channels": channels, "rms": round(rms, 5),
        "peak": round(peak_ratio, 5),
        "longest_near_silence_sec": round(silence_s, 2),
        "clipping_percent": round(clipping_percent, 4),
        "checks": checks, "technical_pass": all(checks.values()),
        "human_listening_approved": False, "published": False,
        "warning": "Technical checks cannot assess dialogue, pronunciation, factual accuracy or voice quality."
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline PODCAST WAV preflight (no publication)")
    parser.add_argument("wav", type=Path)
    args = parser.parse_args()
    try:
        result = inspect_wav(args.wav)
    except (ValueError, wave.Error, EOFError, OSError) as exc:
        print(json.dumps({"technical_pass": False, "error": str(exc), "published": False},
                         ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["technical_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
