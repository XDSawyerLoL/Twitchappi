#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function inspectHostingerBuild(root = process.cwd(), opts = {}) {
  const errors = [];
  const warnings = [];
  const details = {};
  const readJson = name => {
    try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
    catch (_) { errors.push(`${name}: absent ou JSON invalide`); return null; }
  };
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  if (pkg) {
    const startup = typeof pkg.scripts?.start === 'string' ? pkg.scripts.start.trim() : '';
    if (!startup) errors.push('package.json: script start absent');
    else if (startup !== 'node app.js') warnings.push(`Script start inhabituel (${startup}); vérifier le fichier de démarrage Hostinger.`);
    if (pkg.main !== 'app.js') warnings.push('package.json main n’est pas app.js');
    details.startup = startup || null;
  }
  for (const name of ['app.js', 'server.js', 'index_script.js', 'index.html']) {
    if (!fs.existsSync(path.join(root, name))) errors.push(`Fichier requis absent: ${name}`);
  }
  if (pkg && lock) {
    if (!lock.packages || !lock.packages['']) errors.push('package-lock.json: racine npm manquante');
    else {
      const locked = lock.packages[''];
      if (locked.name !== pkg.name) errors.push('Nom du projet différent dans package.json et package-lock.json');
      if (locked.version !== pkg.version) errors.push('Version différente dans package.json et package-lock.json');
      const direct = pkg.dependencies || {};
      const lockedDirect = locked.dependencies || {};
      for (const name of new Set([...Object.keys(direct), ...Object.keys(lockedDirect)])) {
        if (direct[name] !== lockedDirect[name]) errors.push(`Dépendance incohérente dans le verrou: ${name}`);
      }
    }
    const nonPublicRegistries = new Set();
    for (const item of Object.values(lock.packages || {})) {
      if (!item || typeof item.resolved !== 'string') continue;
      try {
        const url = new URL(item.resolved);
        if (url.protocol === 'https:' && url.hostname !== 'registry.npmjs.org') nonPublicRegistries.add(url.hostname);
      } catch (_) { warnings.push('Le verrou contient une URL de paquet non standard.'); }
    }
    if (nonPublicRegistries.size) {
      warnings.push(`Le verrou utilise ${nonPublicRegistries.size} hôte(s) autre(s) que registry.npmjs.org ; contrôler la disponibilité du registre avant npm ci.`);
    }
    details.lockfileVersion = lock.lockfileVersion || null;
  }
  for (const file of ['app.js', 'server.js', 'index_script.js']) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const run = spawnSync(process.execPath, ['--check', file], {cwd: root, encoding: 'utf8', timeout: 15000});
    if (run.error || run.status !== 0) errors.push(`Échec du contrôle syntaxique: ${file}`);
  }
  const major = Number(String(opts.nodeVersion || process.versions.node).split('.')[0]);
  if (major < 20 || !Number.isFinite(major)) errors.push('Node.js 20 ou plus est requis');
  if (major === 20) warnings.push('Node.js 20 est en fin de maintenance ; préparer une validation sous Node 22 ou 24.');
  let declared = null;
  for (const file of ['.node-version', '.nvmrc']) {
    try {
      const value = fs.readFileSync(path.join(root, file), 'utf8').trim();
      if (declared !== null && declared !== value) warnings.push('.nvmrc et .node-version sont différents.');
      declared = value;
    } catch (_) { /* optional */ }
  }
  if (declared && Number(declared.split('.')[0]) !== major) warnings.push(`La version déclarée (${declared}) diffère de celle utilisée pour ce contrôle (${major}).`);
  return {ok: errors.length === 0, errors, warnings, details, checkedAt: new Date().toISOString()};
}

if (require.main === module) {
  const result = inspectHostingerBuild();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.ok ? 'SWAPP PREFLIGHT: OK' : 'SWAPP PREFLIGHT: ÉCHEC');
    result.errors.forEach(x => console.error(`ERREUR: ${x}`));
    result.warnings.forEach(x => console.warn(`AVERTISSEMENT: ${x}`));
  }
  if (!result.ok) process.exitCode = 1;
}
module.exports = {inspectHostingerBuild};
