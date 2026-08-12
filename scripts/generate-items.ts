/**
 * Item generator.
 *
 *   npm run content:generate -- --skill circles --count 20
 *   npm run content:generate -- --plan          (fill the biggest gaps)
 *
 * Generated items land in `content/review/`, never straight into the bank.
 * Everything that survives structural validation still needs a human to read it,
 * because a validator can prove an item is well-formed but not that it is
 * correct — and a wrong answer key is worse than a missing question. It teaches
 * the wrong thing and corrupts the scheduling model at the same time.
 *
 * Run `npm run content:promote` once a batch has been reviewed.
 */

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from '../content/index';
import { itemSchema, validateBank } from '../src/content/schema';
import { ALL_SKILLS, getSkill, type SkillId } from '../src/domain/taxonomy';
import type { Difficulty, Item } from '../src/domain/types';
import { coverageGaps } from '../src/content/sizing';
import { SYSTEM_PROMPT, SUBMIT_ITEMS_TOOL, buildUserPrompt } from './itemPrompt';

const REVIEW_DIR = join(process.cwd(), 'content', 'review');
const DEFAULT_MODEL = 'claude-sonnet-5';

interface Args {
  skill?: SkillId;
  count: number;
  difficulty?: Difficulty;
  model: string;
  plan: boolean;
  /** Skills to fill when planning. */
  topN: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    count: 10,
    model: DEFAULT_MODEL,
    plan: false,
    topN: 3,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--skill':
        args.skill = value as SkillId;
        i += 1;
        break;
      case '--count':
        args.count = Number(value);
        i += 1;
        break;
      case '--difficulty':
        args.difficulty = value as Difficulty;
        i += 1;
        break;
      case '--model':
        args.model = value!;
        i += 1;
        break;
      case '--top':
        args.topN = Number(value);
        i += 1;
        break;
      case '--plan':
        args.plan = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
    }
  }
  return args;
}

/** Next free numeric suffix, so ids never collide with the existing bank. */
function nextIndexFor(prefix: string, items: readonly Item[]): number {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const item of items) {
    const match = pattern.exec(item.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** Short, stable id prefix per skill, matching the hand-authored convention. */
function prefixFor(skillId: SkillId): string {
  const skill = getSkill(skillId);
  const section = skill.domain.startsWith('craft') ||
    skill.domain.startsWith('information') ||
    skill.domain.startsWith('standard') ||
    skill.domain.startsWith('expression')
    ? 'rw'
    : 'm';
  const short = skillId
    .split('_')
    .map((part) => part.slice(0, 3))
    .join('')
    .slice(0, 8);
  return `${section}-gen-${short}`;
}

async function generateBatch(
  client: Anthropic,
  args: Args,
  skillId: SkillId,
  difficulty: Difficulty,
  count: number,
  bank: Item[]
): Promise<Item[]> {
  const examples = bank.filter((i) => i.skills[0] === skillId);
  const prefix = prefixFor(skillId);

  const prompt = buildUserPrompt({
    skillId,
    difficulty,
    count,
    examples,
    existingStems: examples.map((i) => `${i.stimulus ?? ''} ${i.stem}`.trim()),
    idPrefix: prefix,
    startIndex: nextIndexFor(prefix, bank),
  });

  if (args.dryRun) {
    console.log(`\n--- prompt for ${skillId} / ${difficulty} ---\n${prompt.slice(0, 2000)}\n`);
    return [];
  }

  const response = await client.messages.create({
    model: args.model,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [SUBMIT_ITEMS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_items' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    console.error(`  no tool call returned for ${skillId}/${difficulty}`);
    return [];
  }

  return (toolUse.input as { items: Item[] }).items ?? [];
}

/**
 * Structural validation plus a duplicate check against the whole bank.
 *
 * Rejections are reported rather than silently dropped: a skill that keeps
 * failing is a signal to fix the brief in itemPrompt.ts, which is far more
 * durable than patching individual items.
 */
function screen(
  candidates: Item[],
  bank: Item[]
): { accepted: Item[]; rejected: { id: string; reason: string }[] } {
  const accepted: Item[] = [];
  const rejected: { id: string; reason: string }[] = [];

  const seenIds = new Set(bank.map((i) => i.id));
  const key = (item: Item) =>
    `${item.stimulus ?? ''} ${item.stem}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 140);
  const seenKeys = new Set(bank.map(key));

  for (const candidate of candidates) {
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({
        id: candidate.id ?? '(no id)',
        reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      continue;
    }
    if (seenIds.has(candidate.id)) {
      rejected.push({ id: candidate.id, reason: 'duplicate id' });
      continue;
    }
    if (seenKeys.has(key(candidate))) {
      rejected.push({ id: candidate.id, reason: 'near-duplicate of an existing question' });
      continue;
    }

    seenIds.add(candidate.id);
    seenKeys.add(key(candidate));
    accepted.push(candidate as Item);
  }

  return { accepted, rejected };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const bank: Item[] = [...ITEMS];

  // Plan mode: report the gap and target the skills furthest behind.
  const counts = new Map<SkillId, number>();
  for (const skill of ALL_SKILLS) {
    counts.set(skill.id, bank.filter((i) => i.skills[0] === skill.id).length);
  }
  const { gaps, totalHave, totalNeed, percentComplete } = coverageGaps(counts);

  console.log(
    `Bank: ${totalHave} / ${totalNeed} items (${(percentComplete * 100).toFixed(1)}% of the two-year target)`
  );

  let targets: { skillId: SkillId; count: number }[];
  if (args.plan) {
    targets = gaps.slice(0, args.topN).map((gap) => ({
      skillId: gap.skillId,
      count: Math.min(args.count, gap.shortfall),
    }));
    console.log(`\nPlanning ${targets.length} skills with the largest shortfall:`);
    for (const target of targets) {
      const gap = gaps.find((g) => g.skillId === target.skillId)!;
      console.log(`  ${gap.skillName}: have ${gap.have}, need ${gap.need} (+${target.count} now)`);
    }
  } else if (args.skill) {
    targets = [{ skillId: args.skill, count: args.count }];
  } else {
    console.log('\nNothing to do. Pass --skill <id> or --plan.');
    console.log('\nLargest gaps right now:');
    for (const gap of gaps.slice(0, 8)) {
      console.log(`  ${gap.skillId.padEnd(40)} have ${String(gap.have).padStart(3)}  need ${gap.need}`);
    }
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !args.dryRun) {
    console.error('\nSet ANTHROPIC_API_KEY, or pass --dry-run to inspect the prompt.');
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic({ apiKey: apiKey ?? 'dry-run' });
  const difficulties: Difficulty[] = args.difficulty
    ? [args.difficulty]
    : ['easy', 'medium', 'hard'];

  const allAccepted: Item[] = [];
  const allRejected: { id: string; reason: string }[] = [];

  for (const target of targets) {
    // Spread the requested count across difficulty bands rather than producing
    // a batch that is all one level.
    const per = Math.max(1, Math.round(target.count / difficulties.length));
    for (const difficulty of difficulties) {
      process.stdout.write(`  ${target.skillId} / ${difficulty} … `);
      try {
        const candidates = await generateBatch(
          client,
          args,
          target.skillId,
          difficulty,
          per,
          [...bank, ...allAccepted]
        );
        const { accepted, rejected } = screen(candidates, [...bank, ...allAccepted]);
        allAccepted.push(...accepted);
        allRejected.push(...rejected);
        console.log(`${accepted.length} accepted, ${rejected.length} rejected`);
      } catch (error) {
        console.log(`failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (args.dryRun) return;

  if (allAccepted.length === 0) {
    console.log('\nNothing accepted.');
    if (allRejected.length > 0) {
      console.log('Rejections:');
      for (const r of allRejected.slice(0, 20)) console.log(`  ${r.id}: ${r.reason}`);
    }
    return;
  }

  mkdirSync(REVIEW_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(REVIEW_DIR, `batch-${stamp}.json`);
  writeFileSync(outPath, `${JSON.stringify({ items: allAccepted }, null, 2)}\n`, 'utf-8');

  console.log(`\n${allAccepted.length} items written to ${outPath}`);
  if (allRejected.length > 0) {
    console.log(`${allRejected.length} rejected:`);
    for (const r of allRejected.slice(0, 20)) console.log(`  ${r.id}: ${r.reason}`);
  }

  const check = validateBank([...bank, ...allAccepted], []);
  const errors = check.issues.filter((i) => i.level === 'error');
  console.log(
    errors.length === 0
      ? '\nCombined bank passes structural validation.'
      : `\nCombined bank has ${errors.length} structural errors — review before promoting.`
  );
  console.log('\nNext: read the batch, delete anything wrong, then npm run content:promote');
}

void main();
