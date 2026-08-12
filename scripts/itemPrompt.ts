/**
 * The authoring brief handed to the model when generating items.
 *
 * This file *is* the quality control. A validator can prove an item is
 * well-formed; it cannot prove the question is any good. Nearly everything that
 * separates a usable SAT item from a plausible-looking one is encoded here, in
 * the rules and the worked examples.
 *
 * Treat it as the item-writing style guide, and edit it when review turns up a
 * recurring flaw — that is cheaper and more durable than correcting items
 * one at a time.
 */

import type { Difficulty, Item } from '../src/domain/types';
import { getDomain, getSkill, type SkillId } from '../src/domain/taxonomy';
import { SYMBOLS } from '../src/ui/mathParser';

const SUPPORTED_COMMANDS = ['\\frac', '\\sqrt', ...Object.keys(SYMBOLS).map((s) => `\\${s}`)];

export const SYSTEM_PROMPT = `You write practice questions for the Digital SAT.

Your questions are used by exactly one student, every day, for two years. They will
notice patterns. Repetitive phrasing, recycled scenarios, and formulaic distractors
become obvious fast and erode trust in the whole bank.

## Non-negotiable rules

1. ORIGINALITY. Write every question from scratch. Never reproduce, paraphrase, or
   closely imitate a released College Board question, or any item from a commercial
   prep provider. Invent your own contexts, names, numbers, and passages. If you find
   yourself recalling a specific published question, discard it and write another.

2. ONE DEFENSIBLE ANSWER. Exactly one option is correct and the others are clearly
   wrong to someone who understands the skill. No "best of several defensible
   answers". For Reading & Writing especially, a distractor must be wrong for a
   statable reason, not merely weaker.

3. DISTRACTORS ENCODE ERRORS. Each wrong option should correspond to a specific
   mistake a real student makes: a sign error, a reversed conditional probability,
   answering the wrong question (finding x when asked for y), applying a percentage
   to the wrong base, choosing a true-but-irrelevant statement. Never use filler
   options. Never make the correct answer conspicuously longer or more detailed.

4. RATIONALES TEACH. Explain why the correct answer is correct AND why the most
   tempting wrong option is wrong. Name the specific error it represents. Two to four
   sentences. Write to the student, not about them.

5. SELF-CONTAINED. Everything needed to answer is in the stimulus, stem, figure, and
   choices. Never reference outside material or a previous question.

## Reading & Writing specifics

- Each question carries its own short text (25-150 words) in the "stimulus" field.
  The Digital SAT does not use long shared passages.
- Vary subject matter across science, social science, humanities, and literature.
  Vary the named people; do not reuse a name across items.
- Words-in-context items must have context that genuinely determines the answer.
  A student who knows all four words must still be able to pick one.
- Standard English Conventions items test one convention at a time, with a blank
  where the tested element belongs. Keep the stem boilerplate exactly as shown.
- Cross-text-connections items need two texts: "stimulus" and "stimulusB".

## Math specifics

- Use LaTeX only inside $...$ delimiters, and only these commands:
  ${SUPPORTED_COMMANDS.join(' ')}
  Nothing else renders. No \\begin, \\text, \\left, \\right, \\displaystyle, or matrices.
- Verify your arithmetic before writing the rationale. A wrong answer key is the worst
  possible defect: it teaches the student the wrong thing and corrupts the scheduling
  model. Solve the problem twice.
- Student-produced response ("spr") items have no choices. Supply every accepted form
  in the answer array, e.g. ["0.28", ".28", "7/25"]. SPR answers on the real test
  cannot be negative in most cases — prefer positive answers.
- Escape literal dollar amounts as \\$45 so they are not read as math delimiters.

## Difficulty

- easy: one step, or direct recall of a definition. A prepared student answers in
  under a minute without writing anything down.
- medium: two or three steps, or one step with a common trap.
- hard: multi-step, or requires recognising which method applies, or a subtle
  distinction between close options. Should still be solvable in about two minutes.

Difficulty is load-bearing: it is a frozen input to the ability model, so mislabelling
corrupts the estimate for the whole skill. Label by how a mid-preparation student would
experience the item, not by how it reads to an expert.

## Timing

"estimatedSeconds" drives the session budget. Reading & Writing items average about 70
seconds, Math about 95. Set it per item: 45-70 for easy, 70-95 for medium, 90-130 for
hard. Systematic underestimation makes every session overrun.`;

export interface GenerationRequest {
  skillId: SkillId;
  difficulty: Difficulty;
  count: number;
  /** Existing items for this skill, used as worked examples. */
  examples: Item[];
  /** Stems already in the bank, so the model can avoid duplicating them. */
  existingStems: string[];
  /** Next free numeric suffix for ids. */
  idPrefix: string;
  startIndex: number;
}

export function buildUserPrompt(request: GenerationRequest): string {
  const skill = getSkill(request.skillId);
  const domain = getDomain(skill.domain);

  const examples = request.examples
    .slice(0, 4)
    .map((item, i) => `### Example ${i + 1} (${item.difficulty})\n${JSON.stringify(item, null, 2)}`)
    .join('\n\n');

  const avoid = request.existingStems
    .slice(0, 60)
    .map((s) => `- ${s.slice(0, 110)}`)
    .join('\n');

  return `Write ${request.count} new ${request.difficulty} questions for this skill.

## Skill
- id: ${skill.id}
- name: ${skill.name}
- description: ${skill.description}
- domain: ${domain.name} (${domain.id})
- section: ${domain.section}

## Existing items for this skill, as format and quality references

${examples || '(none yet — you are establishing the pattern for this skill)'}

## Questions already in the bank — do not duplicate these, or minor variants of them

${avoid || '(none)'}

## Output

Call the \`submit_items\` tool once with all ${request.count} items.

Set for every item:
- "id": "${request.idPrefix}-${String(request.startIndex).padStart(3, '0')}" and consecutive ids after it
- "section": "${domain.section}"
- "domain": "${skill.domain}"
- "skills": ["${skill.id}"]
- "difficulty": "${request.difficulty}"
- "source": { "kind": "original" }
- "version": 1

Make the ${request.count} questions genuinely different from one another — different
contexts, different numbers, different traps. Not one template filled in ${request.count} times.`;
}

/**
 * Tool schema for structured output.
 *
 * Deliberately looser than the Zod schema: the model returns items, and the
 * real validation runs locally afterwards. Duplicating every constraint here
 * would mean maintaining the rules in two places and letting them drift.
 */
export const SUBMIT_ITEMS_TOOL = {
  name: 'submit_items',
  description: 'Submit the generated practice questions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            section: { type: 'string', enum: ['rw', 'math'] },
            domain: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            itemType: { type: 'string', enum: ['mcq', 'spr'] },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            stimulus: { type: 'string' },
            stimulusB: { type: 'string' },
            stem: { type: 'string' },
            choices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                  text: { type: 'string' },
                },
                required: ['id', 'text'],
              },
            },
            answer: {
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            rationale: { type: 'string' },
            figure: { type: 'object' },
            source: {
              type: 'object',
              properties: { kind: { type: 'string' } },
              required: ['kind'],
            },
            estimatedSeconds: { type: 'number' },
            version: { type: 'number' },
          },
          required: [
            'id',
            'section',
            'domain',
            'skills',
            'itemType',
            'difficulty',
            'stem',
            'answer',
            'rationale',
            'source',
            'estimatedSeconds',
            'version',
          ],
        },
      },
    },
    required: ['items'],
  },
};
