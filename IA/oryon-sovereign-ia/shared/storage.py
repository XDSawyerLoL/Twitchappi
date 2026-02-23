from __future__ import annotations
import sqlite3
import os
from contextlib import contextmanager
from typing import Iterator

DB_PATH_DEFAULT = "/app/storage/sovereign.db"

SCHEMA = '''
CREATE TABLE IF NOT EXISTS threads(
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs(
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL,
  summary TEXT,
  created_at TEXT NOT NULL
);
'''

@contextmanager
def db(db_path: str = None) -> Iterator[sqlite3.Connection]:
    path = db_path or os.getenv("DB_PATH", DB_PATH_DEFAULT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    con = sqlite3.connect(path)
    try:
        con.execute("PRAGMA journal_mode=WAL;")
        con.executescript(SCHEMA)
        yield con
        con.commit()
    finally:
        con.close()
