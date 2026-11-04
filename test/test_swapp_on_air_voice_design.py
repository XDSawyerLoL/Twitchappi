"""Source-only and dry-run checks for French synthetic voice design."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT / "scripts" / "swapp-on-air-qwen-design-fr.py"
EPISODE = ROOT / "data" / "swapp-on-air" / "voice-natural-demo.json"


class FrenchVoiceDesignTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("swapp_fr_design", DESIGN)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_two_native_french_character_anchors(self):
        self.assertEqual(set(self.module.ANCHORS), {"NOVA", "KERN"})
        for name, (speech, instruction) in self.module.ANCHORS.items():
            self.assertTrue(len(speech) >= 50, name)
            self.assertIn("French", instruction)
            self.assertIn("podcast", instruction)

    def test_plan_does_not_claim_aoede_reproduction_or_publication(self):
        class Args:
            clone_size = "standard"
            allow_download = False
            render = False
        result = self.module.plan(Args())
        self.assertTrue(result["does_not_match_historical_aoede"])
        self.assertFalse(result["automatically_published"])
        self.assertFalse(result["model_download_allowed"])
        self.assertFalse(result["audio_generated"])
        self.assertIn("1.7B-Base", result["clone_model"])

    def test_dry_run_does_not_access_voice_models_or_create_files(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "not-created.wav"
            command = [sys.executable, str(DESIGN), "--episode", str(EPISODE),
                       "--output", str(target)]
            process = subprocess.run(command, capture_output=True, text=True,
                                     timeout=15, check=True)
            self.assertIn("Dry run", process.stdout)
            self.assertFalse(target.exists())
            self.assertFalse((Path(folder) / "not-created-reference-voices").exists())

    def test_voice_clone_uses_explicit_generated_anchors_only(self):
        source = DESIGN.read_text(encoding="utf-8")
        self.assertIn('"--authorized-reference"', source)
        self.assertIn('generate_voice_design(', source)
        self.assertIn('"clone"', source)
        self.assertNotIn("gemini", source.lower())
        self.assertNotIn("elevenlabs", source.lower())


if __name__ == "__main__":
    unittest.main()
