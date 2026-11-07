"""No-network tests for the SWAPP ON AIR Qwen3-TTS planning and consent gates."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "swapp-on-air-qwen-local.py"
EPISODE = ROOT / "data" / "swapp-on-air" / "voice-natural-demo.json"


class VoicePilotPlanningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("swapp_on_air_qwen", RUNNER)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_dialogue_validates_without_models(self):
        episode = self.module.load_episode(EPISODE)
        self.assertEqual(len(episode["segments"]), 10)
        self.assertFalse(episode["publication_allowed"])
        self.assertEqual({t["speaker"] for t in episode["segments"]}, {"NOVA", "KERN"})

    def test_explicit_dialogue_pause_is_checked_without_loading_voice_models(self):
        with tempfile.TemporaryDirectory() as folder:
            data = self.module.load_episode(EPISODE)
            data["segments"][0]["pause_after_ms"] = 100
            p = Path(folder) / "valid.json"
            p.write_text(json.dumps(data), encoding="utf-8")
            self.assertEqual(self.module.load_episode(p)["segments"][0]["pause_after_ms"], 100)
            for invalid in [0, 2000, "100", True]:
                data["segments"][0]["pause_after_ms"] = invalid
                p.write_text(json.dumps(data), encoding="utf-8")
                with self.assertRaises(ValueError):
                    self.module.load_episode(p)

    def test_voice_clone_and_custom_use_local_models(self):
        p = self.module.plan(self.module.load_episode(EPISODE), "custom", "light")
        self.assertEqual(p["models"], ["Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"])
        self.assertFalse(p["publication_allowed"])
        p = self.module.plan(self.module.load_episode(EPISODE), "clone", "standard")
        self.assertEqual(p["models"], ["Qwen/Qwen3-TTS-12Hz-1.7B-Base"])

    def test_nonconsensual_or_unpublished_recordings_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            filepath = Path(folder) / "bad.json"
            item = self.module.load_episode(EPISODE)
            item["publication_allowed"] = True
            filepath.write_text(json.dumps(item), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.module.load_episode(filepath)

    def test_default_invocation_is_dry_run_without_qwen_or_torch_download(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run(
                [sys.executable, str(RUNNER), "--episode", str(EPISODE),
                 "--output", str(Path(folder) / "should-not-exist.wav")],
                capture_output=True, text=True, check=True, timeout=15,
            )
            self.assertIn("Dry run only", result.stdout)
            self.assertFalse((Path(folder) / "should-not-exist.wav").exists())

    def test_encoding_existing_wav_without_loading_neural_models(self):
        import math
        import shutil
        import struct
        import wave
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "episode.wav"
            with wave.open(str(file), "wb") as sound:
                sound.setnchannels(1)
                sound.setsampwidth(2)
                sound.setframerate(24000)
                sample = [int(4000 * math.sin(2 * math.pi * 440 * n / 24000))
                          for n in range(24_000 * 25)]
                sound.writeframes(struct.pack("<" + "h" * len(sample), *sample))
            cmd = [sys.executable, str(RUNNER), "--episode", str(EPISODE),
                   "--output", str(file), "--encode-only"]
            can_encode = bool(shutil.which("ffmpeg"))
            if not can_encode:
                try:
                    import imageio_ffmpeg
                    can_encode = bool(imageio_ffmpeg.get_ffmpeg_exe())
                except (ImportError, RuntimeError, OSError):
                    pass
            if not can_encode:
                self.skipTest("No local free FFmpeg binary available")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=45)
            data = json.loads(result.stdout)
            self.assertTrue(data["reused_audio"])
            mp3 = file.with_suffix(".mp3")
            self.assertGreater(mp3.stat().st_size, 30000)
            self.assertTrue(file.exists(), "Original WAV must be preserved")
            # A second run must refuse to overwrite the validated MP3.
            repeated = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            self.assertNotEqual(repeated.returncode, 0)
            self.assertIn("already exists", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
