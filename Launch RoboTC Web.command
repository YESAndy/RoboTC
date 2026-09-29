#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v node >/dev/null; then
  echo 'RoboTC local preview needs Node.js 22 or newer. The hosted website needs no installation.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -f dist/index.html ]]; then npm run build; fi
npm run preview -- --open
