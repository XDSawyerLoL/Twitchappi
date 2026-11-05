"""SWAPP ON AIR: actual verified editorial pilot and local studio launch metadata."""
import base64
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data/swapp-on-air/episode-pikmin-20261105.json"
OPEN=ROOT/"scripts/swapp-on-air-open-studio.py"
RENDER=ROOT/"scripts/swapp-on-air-qwen-local.py"

class TestOnAirRealPilot(unittest.TestCase):
    def test_verified_pilot_is_never_mistaken_for_published_mp3(self):
        episode=json.loads(DATA.read_text(encoding="utf-8"))
        self.assertIs(episode["publication_allowed"],False)
        self.assertIs(episode["editorial_review_required"],True)
        self.assertIs(episode["audio_review_required"],True)
        self.assertGreaterEqual(len(episode["segments"]),20)
        self.assertLessEqual(len(episode["segments"]),80)
        self.assertEqual(set(x["speaker"] for x in episode["segments"]),{"NOVA","KERN"})
        for turn in episode["segments"]:
            self.assertTrue(3<=len(turn["text"].strip())<=350)
            self.assertLessEqual(len(turn["delivery"]),180)
        self.assertTrue(episode["sources"])
        self.assertTrue(all(x["url"].startswith("https://www.nintendo.com/") for x in episode["sources"]))

    def test_local_render_dry_run_loads_real_pilot_with_no_models(self):
        result=subprocess.run([sys.executable,str(RENDER),"--episode",str(DATA)],
            cwd=ROOT,text=True,capture_output=True,timeout=15,check=True)
        payload=json.loads(result.stdout.split("Dry run only:")[0])
        self.assertEqual(payload["turns"],30)
        self.assertFalse(payload["generates_audio"])
        self.assertFalse(payload["publication_allowed"])

    def test_local_studio_prefill_contains_only_verified_editorial_metadata(self):
        spec=importlib.util.spec_from_file_location("swapp_on_air_open",OPEN)
        m=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        episode=json.loads(DATA.read_text(encoding="utf-8"))
        url=m.build_url(episode)
        self.assertTrue(url.startswith("https://swapp.tv/on-air/studio#prefill="))
        segment=url.split("#prefill=",1)[1]
        raw=base64.urlsafe_b64decode(segment+"="*((4-len(segment)%4)%4))
        data=json.loads(raw.decode("utf-8"))
        self.assertEqual(data["slug"],episode["slug"])
        self.assertEqual(data["sources"],episode["sources"])
        self.assertNotIn("segments",data)
        self.assertNotIn("audio",data)

    def test_windows_free_launcher_calls_real_voice_model_and_requires_approval(self):
        ps=(ROOT/"scripts/swapp-on-air-start-fr.ps1").read_text(encoding="utf-8")
        self.assertIn("--clone-size','light",ps)
        self.assertIn("--render','--allow-download",ps)
        self.assertIn("Read-Host",ps)
        self.assertIn("swapp-on-air-open-studio.py",ps)
        self.assertNotIn("elevenlabs",ps.lower())
        self.assertNotIn("api-key",ps.lower())

if __name__=="__main__":
    unittest.main()
