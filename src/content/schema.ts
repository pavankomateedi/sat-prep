/**
 * T-21 — Content schema and licensing validation.
 *
 * Every authored item passes through here before it can enter the bank. The
 * point is not just shape-checking: PRD Part 1 §2 sets hard content rules
 * (nothing scraped, nothing from behind a login, CC BY attribution preserved,
 * official PDFs used only as delivered), and an item that can't prove its
 * provenance is a licensing liability. So provenance is a required field and
 * the validator rejects anything that can't substantiate it.
 */

import { z } from 'zod';
import { ALL_SKILLS, getSkill, isDomainId, isSkillId } from '../domain/taxonomy';
import type { Item, Passage } from '../domain/types';

const SKILL_IDS = ALL_SKILLS.map((s) => s.id) as [string, ...string[]];

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sourceAttributionSchema = z
  .object({
    kind: z.enum(['public_domain', 'cc_by_4_0', 'original', 'official_as_delivered']),
    title: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    url: z.string().url().optional(),
    licenseUrl: z.string().url().optional(),
    retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    attributionText: z.string().min(1).optional(),
    modifications: z.string().min(1).optional(),
  })
  .superRefine((src, ctx) => {
    const require = (field: keyof typeof src, why: string) => {
      if (!src[field]) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for ${src.kind} sources: ${why}`,
        });
      }
    };

    switch (src.kind) {
      case 'cc_by_4_0':
        // CC BY 4.0 §3(a) obliges attribution, a link to the licence, and an
        // indication of whether the material was modified. All three are
        // required here so the app's Attributions screen can render a compliant
        // credit line without anyone having to reconstruct it later.
        require('title', 'CC BY requires naming the work');
        require('url', 'CC BY requires a link to the source');
        require('attributionText', 'CC BY requires a displayable credit line');
        require('modifications', 'CC BY requires stating whether the work was adapted');
        break;
      case 'public_domain':
        require('title', 'public-domain status must be traceable to a named work');
        break;
      case 'official_as_delivered':
        // PRD Part 1 §2 permits official College Board practice PDFs only "as
        // delivered". Re-typesetting them into the item bank is exactly what
        // that rule forbids, so this kind is legal on a *test* record but never
        // on an authored bank item — enforced in `itemSchema` below.
        require('title', 'the specific official practice test must be identified');
        break;
      case 'original':
        break;
    }
  });

const choiceSchema = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1),
});

const figureSchema = z.object({
  kind: z.enum(['table', 'scatter', 'bar', 'line']),
  caption: z.string().optional(),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  series: z
    .array(
      z.object({
        label: z.string(),
        points: z.array(z.object({ x: z.number(), y: z.number() })),
      })
    )
    .optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export const passageSchema = z.object({
  id: z.string().regex(idPattern),
  title: z.string().min(1),
  body: z.string().min(40),
  bodyB: z.string().min(40).optional(),
  source: sourceAttributionSchema,
  sourceB: sourceAttributionSchema.optional(),
  wordCount: z.number().int().positive(),
});

/** `$...$` spans carry LaTeX. Unbalanced delimiters render as literal garbage. */
export function hasBalancedMathDelimiters(text: string): boolean {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '$' && text[i - 1] !== '\\') count += 1;
  }
  return count % 2 === 0;
}

export const itemSchema = z
  .object({
    id: z.string().regex(idPattern),
    section: z.enum(['rw', 'math']),
    domain: z.string().refine(isDomainId, 'Unknown domain id'),
    skills: z.array(z.enum(SKILL_IDS)).min(1),
    itemType: z.enum(['mcq', 'spr']),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    stimulus: z.string().min(20).optional(),
    stimulusB: z.string().min(20).optional(),
    stem: z.string().min(5),
    choices: z.array(choiceSchema).optional(),
    answer: z.union([z.string(), z.array(z.string()).min(1)]),
    rationale: z.string().min(20),
    passageId: z.string().regex(idPattern).optional(),
    figure: figureSchema.optional(),
    source: sourceAttributionSchema,
    estimatedSeconds: z.number().int().min(15).max(300),
    version: z.number().int().positive(),
  })
  .superRefine((item, ctx) => {
    const fail = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: 'custom', path, message });

    // Primary skill must live in the item's declared domain. A mismatch would
    // silently corrupt both the Elo update and the domain-balancing logic.
    const primary = item.skills[0];
    if (primary && isSkillId(primary)) {
      const skill = getSkill(primary);
      if (skill.domain !== item.domain) {
        fail(
          `Primary skill "${primary}" belongs to domain "${skill.domain}", not "${item.domain}"`,
          ['skills', 0]
        );
      }
    }

    if (new Set(item.skills).size !== item.skills.length) {
      fail('Duplicate skill tags', ['skills']);
    }

    if (item.itemType === 'mcq') {
      if (!item.choices || item.choices.length !== 4) {
        fail('MCQ items need exactly 4 choices', ['choices']);
      } else {
        const ids = item.choices.map((c) => c.id);
        if (new Set(ids).size !== 4) fail('Choice ids must be A-D and unique', ['choices']);
        if (typeof item.answer !== 'string' || !ids.includes(item.answer as 'A')) {
          fail('MCQ answer must be one of the choice ids', ['answer']);
        }
        const texts = item.choices.map((c) => c.text.trim().toLowerCase());
        if (new Set(texts).size !== texts.length) {
          fail('Two choices have identical text', ['choices']);
        }
      }
    } else {
      // Student-produced response.
      if (item.choices) fail('SPR items must not have choices', ['choices']);
      if (!Array.isArray(item.answer)) {
        fail('SPR answer must be an array of accepted forms', ['answer']);
      }
      if (item.section !== 'math') {
        fail('Student-produced response items only exist in Math', ['itemType']);
      }
    }

    // Every Digital SAT Reading & Writing question is anchored to a text
    // (PRD §1.3) — normally its own stimulus, occasionally a shared passage.
    // One or the other, never neither and never both.
    if (item.section === 'rw') {
      if (!item.stimulus && !item.passageId) {
        fail('Reading & Writing items need either a stimulus or a passageId', ['stimulus']);
      }
      if (item.stimulus && item.passageId) {
        fail('Provide either a stimulus or a passageId, not both', ['stimulus']);
      }
    }
    if (item.section === 'math') {
      if (item.passageId) fail('Math items must not reference an R&W passage', ['passageId']);
      if (item.stimulus) fail('Math context belongs in the stem, not a stimulus', ['stimulus']);
    }

    // Paired texts are what cross-text-connections questions actually test.
    if (item.stimulusB && item.skills[0] !== 'cross_text_connections') {
      fail('A second text is only used by cross-text-connections items', ['stimulusB']);
    }
    if (item.skills[0] === 'cross_text_connections' && !item.stimulusB && !item.passageId) {
      fail('Cross-text-connections items need two texts', ['stimulusB']);
    }

    // See the note in `sourceAttributionSchema`: official content may be used
    // as delivered, never re-typeset into this bank.
    if (item.source.kind === 'official_as_delivered') {
      fail(
        'Official College Board content may not be re-typeset into the authored bank ' +
          '(PRD Part 1 §2). Deliver it as the original PDF instead.',
        ['source', 'kind']
      );
    }

    for (const [field, text] of [
      ['stem', item.stem],
      ['rationale', item.rationale],
    ] as const) {
      if (!hasBalancedMathDelimiters(text)) {
        fail(`Unbalanced $ math delimiters in ${field}`, [field]);
      }
    }
    for (const choice of item.choices ?? []) {
      if (!hasBalancedMathDelimiters(choice.text)) {
        fail('Unbalanced $ math delimiters in choice', ['choices']);
      }
    }
  });

export const itemFileSchema = z.object({
  $schema: z.string().optional(),
  items: z.array(itemSchema),
});

export const passageFileSchema = z.object({
  $schema: z.string().optional(),
  passages: z.array(passageSchema),
});

// ---------------------------------------------------------------------------
// Bank-level validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

export interface BankCoverage {
  skillId: string;
  itemCount: number;
  difficulties: string[];
}

export interface BankValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  coverage: BankCoverage[];
  itemCount: number;
  passageCount: number;
}

/** Minimum bar for a skill to count as launch-ready. */
export const MIN_ITEMS_PER_SKILL = 6;
export const MIN_DIFFICULTIES_PER_SKILL = 2;

/**
 * Cross-item checks that can only run once the whole bank is assembled:
 * duplicate ids, dangling passage references, and per-skill coverage against
 * the T-02/T-03 acceptance criteria.
 */
export function validateBank(items: Item[], passages: Passage[]): BankValidationResult {
  const issues: ValidationIssue[] = [];

  const seenItemIds = new Set<string>();
  for (const item of items) {
    if (seenItemIds.has(item.id)) {
      issues.push({ level: 'error', where: item.id, message: 'Duplicate item id' });
    }
    seenItemIds.add(item.id);
  }

  const passageIds = new Set<string>();
  for (const passage of passages) {
    if (passageIds.has(passage.id)) {
      issues.push({ level: 'error', where: passage.id, message: 'Duplicate passage id' });
    }
    passageIds.add(passage.id);
  }

  for (const item of items) {
    if (item.passageId && !passageIds.has(item.passageId)) {
      issues.push({
        level: 'error',
        where: item.id,
        message: `References unknown passage "${item.passageId}"`,
      });
    }
  }

  const referenced = new Set(items.map((i) => i.passageId).filter(Boolean));
  for (const passage of passages) {
    if (!referenced.has(passage.id)) {
      issues.push({
        level: 'warning',
        where: passage.id,
        message: 'Passage has no items attached to it',
      });
    }
  }

  // Near-duplicate questions: over a two-year program the same question
  // resurfacing in slightly different words reads as sloppy and wastes a
  // review slot. Keyed on stimulus + stem, because Standard English
  // Conventions items legitimately share a boilerplate stem ("Which choice
  // completes the text so that it conforms to the conventions of Standard
  // English?") and differ only in the text above it.
  const stemKeys = new Map<string, string>();
  for (const item of items) {
    const key = `${item.stimulus ?? item.passageId ?? ''} ${item.stem}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 160);
    const existing = stemKeys.get(key);
    if (existing) {
      issues.push({
        level: 'warning',
        where: item.id,
        message: `Stem is near-identical to "${existing}"`,
      });
    } else {
      stemKeys.set(key, item.id);
    }
  }

  const coverage: BankCoverage[] = ALL_SKILLS.map((skill) => {
    const forSkill = items.filter((i) => i.skills[0] === skill.id);
    const difficulties = [...new Set(forSkill.map((i) => i.difficulty))];
    if (forSkill.length < MIN_ITEMS_PER_SKILL) {
      issues.push({
        level: 'error',
        where: skill.id,
        message: `Only ${forSkill.length} item(s); need at least ${MIN_ITEMS_PER_SKILL}`,
      });
    }
    if (difficulties.length < MIN_DIFFICULTIES_PER_SKILL) {
      issues.push({
        level: 'error',
        where: skill.id,
        message: `Only ${difficulties.length} difficulty label(s); need at least ${MIN_DIFFICULTIES_PER_SKILL}`,
      });
    }
    return { skillId: skill.id, itemCount: forSkill.length, difficulties };
  });

  return {
    ok: issues.every((i) => i.level !== 'error'),
    issues,
    coverage,
    itemCount: items.length,
    passageCount: passages.length,
  };
}
