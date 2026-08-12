/**
 * Print the current dev-server URL as a scannable QR code, and write an HTML
 * page with a large version of it.
 *
 * Exists because the QR that `expo start` prints lives in whichever terminal
 * launched it — which is no help if the server was started in the background,
 * or if the terminal has scrolled. This reads the same `urlRandomness` Expo
 * stores locally and rebuilds the URL from it.
 *
 *   node scripts/show-qr.mjs            # tunnel URL (default)
 *   node scripts/show-qr.mjs --lan      # LAN URL instead
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';

const PORT = 8081;
const useLan = process.argv.includes('--lan');

function tunnelUrl() {
  const settingsPath = join(process.cwd(), '.expo', 'settings.json');
  if (!existsSync(settingsPath)) return null;
  const { urlRandomness } = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  if (!urlRandomness) return null;
  // Anonymous tunnels (no `expo login`) use the literal "anonymous" slot where
  // a signed-in session would put the account name.
  return `exp://${urlRandomness}-anonymous-${PORT}.exp.direct`;
}

function lanUrl() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.address.startsWith('169.254.')) continue;
      return `exp://${address.address}:${PORT}`;
    }
  }
  return null;
}

const url = useLan ? lanUrl() : (tunnelUrl() ?? lanUrl());

if (!url) {
  console.error('No dev server URL found. Start one first with `npx expo start --tunnel`.');
  process.exit(1);
}

console.log(`\n  ${url}\n`);
console.log(await QRCode.toString(url, { type: 'terminal', small: true }));

const dataUrl = await QRCode.toDataURL(url, { width: 900, margin: 2 });
const outPath = join(process.cwd(), 'qr.html');

writeFileSync(
  outPath,
  `<!doctype html>
<meta charset="utf-8">
<title>Scan to open in Expo Go</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; display: grid;
         place-items: center; min-height: 100vh; margin: 0; gap: 20px;
         background: #FBFBFD; color: #14161C; }
  img  { width: min(70vmin, 520px); image-rendering: pixelated; }
  code { background: #F3F4F8; padding: 10px 16px; border-radius: 8px;
         font-size: 15px; user-select: all; }
  p    { color: #5C6172; max-width: 46ch; text-align: center; line-height: 1.5; }
</style>
<h2>Scan with the iPad Camera app</h2>
<img src="${dataUrl}" alt="QR code linking to the Expo development server">
<code>${url}</code>
<p>Point the Camera app at this code and tap the banner that appears. Expo Go
must already be installed.</p>
`,
  'utf-8'
);

console.log(`  Large version written to: ${outPath}`);
console.log('  Open it and scan with the iPad Camera app.\n');
