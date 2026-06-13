#!/usr/bin/env bash
# Bump the app version across package.json, src-tauri/tauri.conf.json,
# src-tauri/Cargo.toml and src-tauri/Cargo.lock in lockstep.
#
# Usage: scripts/bump-version.sh <version|tag>
#   e.g. scripts/bump-version.sh 0.1.4
#        scripts/bump-version.sh v0.1.4

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version|tag>" >&2
  exit 1
fi

VERSION="${1#v}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid version: $VERSION (expected x.y.z)" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node -e "
  const fs = require('fs');
  const path = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

node -e "
  const fs = require('fs');
  const path = 'src-tauri/tauri.conf.json';
  const conf = JSON.parse(fs.readFileSync(path, 'utf8'));
  conf.version = '$VERSION';
  fs.writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
"

sed -i '' "1,/^version = /s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

sed -i '' "/^name = \"sshelter\"\$/{n;s/^version = \".*\"/version = \"$VERSION\"/;}" src-tauri/Cargo.lock

echo "Bumped version to $VERSION in:"
echo "  package.json"
echo "  src-tauri/tauri.conf.json"
echo "  src-tauri/Cargo.toml"
echo "  src-tauri/Cargo.lock"
