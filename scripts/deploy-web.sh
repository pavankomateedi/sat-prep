#!/bin/bash
# Build and deploy the web target to Vercel.
#
# Two things `expo export --platform web` produces that a plain static host
# can't serve as-is:
#
# 1. Every asset lands under a path containing a `node_modules` segment
#    (e.g. assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.<hash>.wasm)
#    because Metro mirrors the asset's source location. Vercel — like most
#    static hosts — silently excludes any path containing `node_modules` from
#    a deployment, as a hardcoded convention (not something .vercelignore can
#    override). Without the SQLite .wasm file specifically, the app never
#    gets past "Something went wrong: WebAssembly.instantiate(): expected
#    magic word... found 3c 21 44 4f" (that's "<!DO" — Vercel's SPA fallback
#    serving index.html in place of the missing binary).
#
#    Fixed by renaming assets/node_modules -> assets/vendor post-export, and
#    rewriting the same path string everywhere it's referenced in the
#    exported JS bundles (Metro bakes the asset URLs in as string literals).
#
# 2. This is a single-page app (one index.html, client-side routed by
#    expo-router) — vercel.json's rewrite must send unknown paths to
#    index.html for deep links like /session to work, but NOT swallow real
#    asset requests into that same fallback (that was the first failure
#    mode here, before the node_modules issue: /assets/... 200'd but with
#    index.html's bytes). Handled by excluding assets/, _expo/, and the two
#    root files from the rewrite pattern in vercel.json.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Exporting web build"
npx expo export --platform web

echo "==> Fixing node_modules-pathed assets (Vercel excludes these by default)"
if [ -d "dist/assets/node_modules" ]; then
  mv dist/assets/node_modules dist/assets/vendor
  grep -rl "assets/node_modules/" dist --include="*.js" --include="*.html" | while read -r f; do
    sed -i '' 's#assets/node_modules/#assets/vendor/#g' "$f"
  done
fi

echo "==> Copying vercel.json (SPA fallback, excluding real asset paths)"
cp vercel.json dist/vercel.json

echo "==> Deploying to Vercel"
cd dist
npx vercel --prod --yes
