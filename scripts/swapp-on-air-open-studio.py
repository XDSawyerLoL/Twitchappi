#!/usr/bin/env python3
"""Open the SWAPP ON AIR admin studio prefilled with the verified episode.
Only metadata goes into the browser URL fragment. The MP3 STAYS local.
"""
from __future__ import annotations
import argparse
import base64
import json
import webbrowser
from pathlib import Path

def build_url(episode: dict) -> str:
    sources=episode.get("sources",[])
    if not sources or not all(str(s.get("url","")).startswith("https://") for s in sources):
        raise ValueError("Episode requires real HTTPS official sources")
    metadata={
        "title":episode["title"],
        "description":episode["description"],
        "slug":episode["slug"],
        "sources":sources,
        "articles":episode.get("articles",[])
    }
    encoded=base64.urlsafe_b64encode(
        json.dumps(metadata,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    return "https://swapp.tv/on-air/studio#prefill="+encoded

def main() -> None:
    parser=argparse.ArgumentParser(description="Open SWAPP podcast studio")
    parser.add_argument("--episode",type=Path,required=True)
    parser.add_argument("--audio",type=Path,required=True)
    args=parser.parse_args()
    if not args.audio.is_file() or args.audio.suffix.lower()!=".mp3":
        raise FileNotFoundError("A real rendered MP3 is required before opening the studio")
    data=json.loads(args.episode.read_text(encoding="utf-8"))
    url=build_url(data)
    print("MP3 local:",args.audio.resolve())
    print("Studio SWAPP: https://swapp.tv/on-air/studio")
    print("La fiche est préremplie; choisis le MP3 dans le navigateur, écoute et approuve les droits.")
    webbrowser.open(url)

if __name__=="__main__":
    main()
