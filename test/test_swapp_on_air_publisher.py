"""SWAPP ON AIR publisher: no fake audio and no write without deliberate approval."""
import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
PUBLISHER = ROOT / "scripts" / "swapp-on-air-publish.py"


class OnAirPublicationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("swapp_on_air_publish", PUBLISHER)
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def test_non_https_source_is_rejected(self):
        for value in ("Bad=http://example.org/news", "https://example.org/",
                      "Bad=https://user:pass@example.org/", "Bad=javascript:alert(1)"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.mod.validated_source(value)

    def test_unreviewed_audio_is_never_released(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "fake.mp3"
            file.write_bytes(b"ID3" + b"\0" * 40000)
            args = self._args(file)
            args.audio_reviewed = False
            with patch.object(self.mod, "probe", return_value=45):
                with self.assertRaises(PermissionError):
                    self.mod.build_release(args)

    @staticmethod
    def _args(file):
        return argparse.Namespace(
            audio=file, slug="swapp-on-air-episode-test",
            title="Premier épisode de démonstration",
            description="Un véritable épisode validé avant sa diffusion publique sur SWAPP.",
            source=["Studio=https://example.org/annonce"], article=["/actus/annonce-confirmation"],
            audio_reviewed=True, editorial_approved=True, license_confirmed=True,
            publish=False,
        )

    def test_dry_run_is_read_only_even_with_approved_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            media = root / "assets/on-air"
            index = root / "episodes.json"
            index.write_text('{"schema":1,"episodes":[]}', encoding="utf-8")
            fake = root / "test.mp3"
            fake.write_bytes(b"ID3" + b"\0" * 40000)
            args = self._args(fake)
            with patch.object(self.mod, "MANIFEST", index), patch.object(self.mod, "DESTINATION", media):
                with patch.object(self.mod, "probe", return_value=45):
                    outcome = self.mod.run(args)
            self.assertEqual(outcome["mode"], "dry-run")
            self.assertFalse(outcome["published"])
            self.assertFalse(media.exists())
            self.assertEqual(json.loads(index.read_text(encoding="utf-8"))["episodes"], [])

    def test_explicit_local_publish_writes_audio_and_manifest_together(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            media = root / "assets/on-air"
            index = root / "episodes.json"
            index.write_text('{"schema":1,"episodes":[]}', encoding="utf-8")
            fake = root / "test.mp3"
            fake.write_bytes(b"ID3" + b"\0" * 40000)
            args = self._args(fake)
            args.publish = True
            with patch.object(self.mod, "MANIFEST", index), patch.object(self.mod, "DESTINATION", media):
                with patch.object(self.mod, "probe", return_value=45):
                    outcome = self.mod.run(args)
                    self.assertTrue(outcome["published"])
                    self.assertTrue((media / "swapp-on-air-episode-test.mp3").exists())
                    data = json.loads(index.read_text(encoding="utf-8"))
                    self.assertEqual(len(data["episodes"]), 1)
                    self.assertTrue(data["episodes"][0]["audioReviewed"])
                    with self.assertRaises(FileExistsError):
                        self.mod.run(args)


if __name__ == "__main__":
    unittest.main()
