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

    def test_previously_generated_voice_anchors_resume_without_voice_design_model(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "test-episode.wav"
            anchors = Path(folder) / "test-episode-reference-voices"
            anchors.mkdir()
            for speaker in ("nova", "kern"):
                (anchors / (speaker + ".wav")).write_bytes(b"RIFF" + b"0" * 25000)
                (anchors / (speaker + ".txt")).write_text(
                    "Une reference vocale francaise originale de test.", encoding="utf-8"
                )
            args = SimpleNamespace(
                output=target, episode=EPISODE, clone_size="light",
                allow_download=False, allow_cpu=False
            )
            with patch.object(self.module.subprocess, "run") as runner:
                self.module.render(args)
                runner.assert_called_once()
                call = runner.call_args.args[0]
                self.assertIn("--authorized-reference", call)
                self.assertIn("--mode", call)
                self.assertIn("clone", call)
                self.assertIn(str(anchors / "nova.wav"), call)
                self.assertIn(str(anchors / "kern.wav"), call)
            self.assertFalse(target.exists(), "the mocked clone stage must not fabricate WAV output")

    def test_incomplete_voice_anchors_are_never_overwritten(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "test-episode.wav"
            anchors = Path(folder) / "test-episode-reference-voices"
            anchors.mkdir()
            (anchors / "nova.wav").write_bytes(b"bad")
            args = SimpleNamespace(output=target, episode=EPISODE,
                clone_size="light", allow_download=False, allow_cpu=False)
            with patch.object(self.module.subprocess, "run") as runner:
                with self.assertRaisesRegex(RuntimeError,"Incomplete reference voices"):
                    self.module.render(args)
                runner.assert_not_called()
            self.assertTrue((anchors / "nova.wav").exists())


if __name__ == "__main__":
    unittest.main()
