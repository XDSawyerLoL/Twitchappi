"""Offline regression tests for PODCAST WAV technical checks."""
import importlib.util
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "swapp-podcast-audio-preflight.py"
spec = importlib.util.spec_from_file_location("podcast_preflight", SCRIPT)
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)


def write_wav(path, generator, seconds=12, rate=16000):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        for offset in range(0, seconds * rate, rate):
            samples = [generator(i) for i in range(offset, offset + rate)]
            f.writeframes(struct.pack("<" + "h" * len(samples), *samples))


class PodcastAudioPreflightTests(unittest.TestCase):
    def test_normal_audio_passes_without_modification(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "good.wav"
            write_wav(path, lambda i: int(5000 * math.sin(i * 2 * math.pi * 440 / 16000)))
            before = path.read_bytes()
            report = qc.inspect_wav(path)
            self.assertTrue(report["technical_pass"])
            self.assertFalse(report["human_listening_approved"])
            self.assertFalse(report["published"])
            self.assertEqual(before, path.read_bytes())

    def test_silence_fails(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "silent.wav"
            write_wav(path, lambda i: 0)
            report = qc.inspect_wav(path)
            self.assertFalse(report["technical_pass"])
            self.assertFalse(report["checks"]["audible_signal"])

    def test_clipping_fails(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "clipped.wav"
            write_wav(path, lambda i: 32767)
            self.assertFalse(qc.inspect_wav(path)["checks"]["no_excess_clipping"])

    def test_truncated_file_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "bad.wav"
            path.write_bytes(b"not a wav")
            with self.assertRaises((ValueError, wave.Error, EOFError)):
                qc.inspect_wav(path)


if __name__ == "__main__":
    unittest.main()
