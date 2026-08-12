/**
 * Prove a published update actually works, rather than assuming it does
 * because the publish command exited 0.
 *
 *   node scripts/validate-deployment.mjs <update-url> [platform]
 *   node scripts/validate-deployment.mjs https://u.expo.dev/<project-id> ios
 *
 * `eas update` succeeding only means the upload finished. It does not prove the
 * manifest resolves for a given platform and runtime version, nor that the
 * bundle it points at is actually downloadable — and those are the two things
 * that decide whether the app opens on the device.
 *
 * Checks, in order:
 *   1. the manifest resolves for the platform
 *   2. it names a launch asset (the JS bundle)
 *   3. that bundle downloads, at a plausible size
 *   4. every extra asset it references resolves
 */

import { readFileSync, existsSync } from 'node:fs';

const [, , rawUrl, platformArg] = process.argv;
const platform = platformArg ?? 'ios';

if (!rawUrl) {
  console.error('Usage: node scripts/validate-deployment.mjs <update-url> [ios|android]');
  process.exit(1);
}

/** Runtime version must match what the client will ask for. */
function runtimeVersion() {
  const config = JSON.parse(readFileSync('app.json', 'utf-8')).expo;
  const policy = config.runtimeVersion;
  if (typeof policy === 'string') return policy;
  if (policy?.policy === 'appVersion') return config.version;
  return config.version;
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const rv = runtimeVersion();
  console.log(`\nValidating ${rawUrl}`);
  console.log(`  platform=${platform}  runtimeVersion=${rv}\n`);

  let manifest;
  try {
    const response = await fetch(rawUrl, {
      headers: {
        'expo-platform': platform,
        'expo-runtime-version': rv,
        'expo-channel-name': process.env.EXPO_CHANNEL ?? 'preview',
        accept: 'multipart/mixed,application/expo+json,application/json',
      },
    });

    if (!response.ok) {
      record('manifest resolves', false, `HTTP ${response.status}`);
      return finish();
    }

    const text = await response.text();
    // Expo may return the manifest as multipart; pull the JSON part out.
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    manifest = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    record('manifest resolves', true, `HTTP ${response.status}, ${text.length} bytes`);
  } catch (error) {
    record('manifest resolves', false, error.message);
    return finish();
  }

  const launchAsset = manifest.launchAsset;
  if (!launchAsset?.url) {
    record('manifest names a JS bundle', false, 'no launchAsset.url');
    return finish();
  }
  record('manifest names a JS bundle', true, launchAsset.key ?? 'ok');

  try {
    const bundle = await fetch(launchAsset.url);
    const body = await bundle.arrayBuffer();
    const mb = body.byteLength / 1024 / 1024;
    // A bundle far below a megabyte means something was tree-shaken away or
    // an error page was served with a 200.
    record(
      'bundle downloads',
      bundle.ok && mb > 0.5,
      `HTTP ${bundle.status}, ${mb.toFixed(2)} MB`
    );
  } catch (error) {
    record('bundle downloads', false, error.message);
  }

  const assets = manifest.assets ?? [];
  if (assets.length === 0) {
    record('assets resolve', true, 'none referenced');
  } else {
    let failed = 0;
    for (const asset of assets) {
      try {
        const head = await fetch(asset.url, { method: 'GET' });
        if (!head.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    record('assets resolve', failed === 0, `${assets.length - failed}/${assets.length} reachable`);
  }

  finish();
}

function finish() {
  const failures = results.filter((r) => !r.ok);
  console.log(
    failures.length === 0
      ? `\nAll ${results.length} checks passed. The link is live and loadable.\n`
      : `\n${failures.length} of ${results.length} checks failed.\n`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
