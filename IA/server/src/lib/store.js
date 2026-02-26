import fs from 'fs';
import path from 'path';

const DEFAULT_STATE = {
  runs: [],
  settings: {
    defaultRepo: "",
    autopush: false
  }
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  write(nextState) {
    fs.writeFileSync(this.filePath, JSON.stringify(nextState, null, 2), 'utf-8');
  }

  update(mutator) {
    const state = this.read();
    const next = mutator(state) ?? state;
    this.write(next);
    return next;
  }
}
