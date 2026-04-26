#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Installation / mise à jour d'Oryon Local..."
npm install || { echo "Node.js est requis. Installe Node.js LTS."; exit 1; }
echo "Lancement d'Oryon Local..."
npm run app
