#!/bin/bash
# Build and deploy the web target to Vercel, gated by a shared password.
#
# Three things a plain static host needs help with here:
#
# 1. Every exported asset lands under a path containing a `node_modules`
#    segment (e.g. assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite
#    .<hash>.wasm) because Metro mirrors the asset's source location.
#    Vercel — like most static hosts — silently excludes any path
#    containing `node_modules` from a deployment, as a hardcoded
#    convention (not something .vercelignore can override). Without the
#    SQLite .wasm file specifically, the app never gets past
#    "WebAssembly.instantiate(): expected magic word... found 3c 21 44 4f"
#    (that's "<!DO" — index.html served in its place).
#
#    Fixed by renaming assets/node_modules -> assets/vendor post-export,
#    and rewriting the same path string everywhere the exported JS
#    bundles reference it.
#
# 2. This is a single-page app (one index.html, client-side routed by
#    expo-router) — routing must send unknown paths to index.html for
#    deep links like /session to work, but only *after* checking for a
#    real static file first (handled below via Build Output API's
#    `handle: filesystem` route, which tries a real file before falling
#    back).
#
# 3. Access gate: a shared HTTP Basic Auth password in front of
#    everything, via a hand-written Vercel Edge Middleware. Vercel's own
#    native password protection is a Pro-plan feature; this is the free
#    equivalent. The password comes from WEB_ACCESS_PASSWORD in
#    .env.local (gitignored, never committed) and is baked into the
#    deployed middleware function at build time — change it there, not
#    here, to rotate it.
#
# Deploying a hand-built middleware function alongside static output
# means using Vercel's Build Output API (v3) directly — the documented
# way to add custom server/edge behaviour to a deploy that isn't a
# framework Vercel auto-builds. See:
# https://vercel.com/docs/build-output-api/v3

set -euo pipefail
cd "$(dirname "$0")/.."

# Not `source <(grep ...)` — unreliable on macOS's shipped /bin/bash (3.2,
# frozen there for over a decade over GPLv3 licensing), which doesn't
# consistently propagate variables set that way back to the parent shell.
WEB_ACCESS_PASSWORD=""
if [ -f .env.local ]; then
  WEB_ACCESS_PASSWORD="$(grep -E '^WEB_ACCESS_PASSWORD=' .env.local | tail -1 | cut -d= -f2-)"
fi
if [ -z "$WEB_ACCESS_PASSWORD" ]; then
  echo "WEB_ACCESS_PASSWORD not set in .env.local — deploying with no access gate." >&2
fi

echo "==> Exporting web build"
npx expo export --platform web

echo "==> Fixing node_modules-pathed assets (Vercel excludes these by default)"
if [ -d "dist/assets/node_modules" ]; then
  mv dist/assets/node_modules dist/assets/vendor
  grep -rl "assets/node_modules/" dist --include="*.js" --include="*.html" | while read -r f; do
    sed -i '' 's#assets/node_modules/#assets/vendor/#g' "$f"
  done
fi

echo "==> Assembling Build Output API v3 structure (static output + auth middleware)"
rm -rf dist/.vercel
mkdir -p dist/.vercel/output/static
# Move everything except the .vercel dir we just made into static/.
find dist -mindepth 1 -maxdepth 1 ! -name '.vercel' -exec mv {} dist/.vercel/output/static/ \;

mkdir -p dist/.vercel/output/functions/middleware.func
cat > dist/.vercel/output/functions/middleware.func/.vc-config.json <<'EOF'
{ "runtime": "edge", "entrypoint": "index.js" }
EOF

# Password baked in as a literal at build time — this file only ever
# exists inside dist/ (gitignored), never committed. No gate at all if
# WEB_ACCESS_PASSWORD is unset (empty EXPECTED never matches a real
# Authorization header, which would lock everyone out silently).
if [ -z "$WEB_ACCESS_PASSWORD" ]; then
  cat > dist/.vercel/output/functions/middleware.func/index.js <<'EOF'
export default function middleware() {
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}
EOF
else
  python3 - "$WEB_ACCESS_PASSWORD" <<'PYEOF' > dist/.vercel/output/functions/middleware.func/index.js
import sys
password = sys.argv[1]
print(f'''const EXPECTED = "Basic " + btoa("family:{password}");

export default function middleware(request) {{
  const auth = request.headers.get("authorization");
  if (auth === EXPECTED) {{
    return new Response(null, {{ headers: {{ "x-middleware-next": "1" }} }});
  }}
  return new Response("Authentication required", {{
    status: 401,
    headers: {{ "WWW-Authenticate": 'Basic realm="SAT Prep"' }},
  }});
}}
''')
PYEOF
fi

cat > dist/.vercel/output/config.json <<'EOF'
{
  "version": 3,
  "routes": [
    { "src": "/(.*)", "middlewarePath": "middleware" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
EOF

echo "==> Deploying to Vercel"
cd dist
npx vercel deploy --prebuilt --prod --yes
