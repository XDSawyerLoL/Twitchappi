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


if __name__ == "__main__":
    unittest.main()
