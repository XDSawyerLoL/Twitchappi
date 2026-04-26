const fs = require('fs');
const path = require('path');

const candidates = [
  'NOTE_V6_21_03_2026.md',
  'PASSE_V6_BLINDEE.md',
  'BLOC_SUIVANT_ET_CORRECTIFS_21_03_2026.md',
  'CHANGEMENTS_21_MARS_2026.md',
  'CHANGEMENTS_CORRECTIFS_21_03_2026.md',
  'CORRECTIONS_V4_21_03_2026.md',
  'NOTE_CORRECTIONS_21_03_2026_v3.md',
  'RAPPORT_CORRECTIONS_FINAL_FR.md'
];

const removed = [];
for (const rel of candidates) {
  const p = path.join(process.cwd(), rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { force: true });
    removed.push(rel);
  }
}

console.log(JSON.stringify({ removed }, null, 2));
