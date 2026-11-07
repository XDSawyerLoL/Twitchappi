"""Unit tests for SWAPP PODCAST Piper offline validation without downloading models."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "swapp-podcast-piper-cpu.py"
EPISODE = ROOT / "data" / "swapp-on-air" / "episode-pikmin-20261105.json"

class TestPodcastPiper(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("podcast_piper_cpu", SCRIPT)
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def test_existing_dialogue_is_accepted_without_models(self):
        self.assertEqual(len(self.mod.validate_episode(EPISODE)), 30)

    def test_dry_run_does_not_create_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            mp3 = Path(tmp) / "never.mp3"
            result = subprocess.run([sys.executable, str(SCRIPT), "--episode",
                                     str(EPISODE), "--output", str(mp3)],
                                    capture_output=True, text=True, check=True, timeout=15)
            self.assertIn('"audio_generated": false', result.stdout)
            self.assertFalse(mp3.exists())

    def test_publication_and_invalid_pause_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = json.loads(EPISODE.read_text(encoding="utf-8"))
            file = Path(tmp) / "episode.json"
            data["publication_allowed"] = True
            file.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.mod.validate_episode(file)
            data["publication_allowed"] = False
            data["segments"][0]["pause_after_ms"] = True
            file.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ValueError):
                self.mod.validate_episode(file)

    def test_missing_models_fail_before_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                self.mod.check_voice_files(Path(tmp))

if __name__ == "__main__":
    unittest.main()
