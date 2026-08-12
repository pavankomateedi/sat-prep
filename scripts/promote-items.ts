/**
 * Move reviewed items from the review queue into the live bank.
 *
 *   npm run content:promote            (promote every reviewed batch)
 *   npm run content:promote -- --check (report what would happen, change nothing)
 *
 * Items are appended to the generated-content file for their domain, which is
 * kept separate from the hand-authored files. That separation matters during
 * review: if a defect pattern turns up later, you can tell at a glance which
 * items came from which process.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from '../content/index';
import { itemSchema, validateBank } from '../src/content/schema';
import { getDomain, type DomainId } from '../src/domain/taxonomy';
import type { Item } from '../src/domain/types';

const REVIEW_DIR = join(process.cwd(), 'content', 'review');
const GENERATED_DIR = join(process.cwd(), 'content', 'generated');

function generatedFileFor(domain: DomainId): string {
  const section = getDomain(domain).section;
  return join(GENERATED_DIR, `${section}-${domain.replace(/_/g, '-')}.json`);
}

function readItems(path: string): Item[] {
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, 'utf-8')) as { items: Item[] }).items ?? [];
}

function main(): void {
  const check = process.argv.includes('--check');

  if (!existsSync(REVIEW_DIR)) {
    console.log('No review queue. Run npm run content:generate first.');
    return;
  }

  const batches = readdirSync(REVIEW_DIR).filter((f) => f.endsWith('.json'));
  if (batches.length === 0) {
    console.log('Review queue is empty.');
    return;
  }

  const incoming: Item[] = [];
  for (const batch of batches) {
    incoming.push(...readItems(join(REVIEW_DIR, batch)));
  }

  console.log(`${incoming.length} items across ${batches.length} batch file(s).`);

  // Re-validate on the way in. The generator already screened these, but a
  // human has edited the file since, and hand-edits are exactly where a broken
  // JSON field or an unbalanced $ creeps in.
  const valid: Item[] = [];
  const invalid: string[] = [];
  for (const item of incoming) {
    const parsed = itemSchema.safeParse(item);
    if (parsed.success) valid.push(item);
    else {
      invalid.push(
        `${item.id ?? '(no id)'}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
      );
    }
  }

  if (invalid.length > 0) {
    console.log(`\n${invalid.length} item(s) failed validation and will NOT be promoted:`);
    for (const line of invalid.slice(0, 20)) console.log(`  ${line}`);
  }

  const existingIds = new Set(ITEMS.map((i) => i.id));
  const promotable = valid.filter((item) => {
    if (existingIds.has(item.id)) {
      console.log(`  skipping ${item.id}: already in the bank`);
      return false;
    }
    return true;
  });

  const combined = validateBank([...ITEMS, ...promotable], []);
  const errors = combined.issues.filter((i) => i.level === 'error');
  if (errors.length > 0) {
    console.log(`\nCombined bank would have ${errors.length} error(s):`);
    for (const issue of errors.slice(0, 15)) console.log(`  ${issue.where}: ${issue.message}`);
    console.log('\nNothing promoted.');
    process.exitCode = 1;
    return;
  }

  if (check) {
    console.log(`\n--check: ${promotable.length} item(s) are ready to promote.`);
    return;
  }

  mkdirSync(GENERATED_DIR, { recursive: true });
  const byDomain = new Map<DomainId, Item[]>();
  for (const item of promotable) {
    const list = byDomain.get(item.domain) ?? [];
    list.push(item);
    byDomain.set(item.domain, list);
  }

  for (const [domain, items] of byDomain) {
    const path = generatedFileFor(domain);
    const merged = [...readItems(path), ...items];
    writeFileSync(path, `${JSON.stringify({ items: merged }, null, 2)}\n`, 'utf-8');
    console.log(`  ${domain}: +${items.length} (${merged.length} total in ${path})`);
  }

  for (const batch of batches) unlinkSync(join(REVIEW_DIR, batch));

  console.log(`\nPromoted ${promotable.length} items.`);
  console.log('Register any new files in content/index.ts, then run npm test.');
}

main();
