/**
 * "Explain this differently" — an optional conversational layer over a single
 * question.
 *
 * PRD §4.1 lists the absence of this as a gap: the plan shows a rationale after
 * a retry but nothing conversational, which several AI-tutor competitors lead
 * with.
 *
 * ## This is the one feature that leaves the device
 *
 * Everything else in this app works with no network by design (§2.5). This does
 * not, and pretending otherwise would be dishonest. So the boundaries are drawn
 * tightly and enforced rather than described:
 *
 *  - **Off by default.** Requires an API key the family enters themselves.
 *  - **Never on the critical path.** The daily session works identically whether
 *    this is configured, offline, or failing. It is a button that sometimes is
 *    not there.
 *  - **A fixed payload.** Only the question, the choices, the official
 *    rationale, and which option was selected. No name, no history, no score, no
 *    identifiers — `buildContext` constructs the payload and `assertClean`
 *    screens it before it can be sent (T-13).
 *  - **Scoped to one question.** The system prompt refuses to wander, so this
 *    cannot become a general chatbot with a minor.
 *
 * The API key lives in the device keychain via expo-secure-store and is never
 * synced, logged, or included in any backup payload.
 */

import * as SecureStore from 'expo-secure-store';
import type { Item } from '../domain/types';
import { assertClean } from '../privacy/policy';
import { toPlainText, parseMixed } from '../ui/mathParser';

const KEY_STORE_NAME = 'anthropic_api_key';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

/** Hard ceiling on turns, so a session cannot drift into open-ended chat. */
export const MAX_TURNS = 6;

export const TUTOR_SYSTEM_PROMPT = `You are helping one high-school student understand a single SAT practice question they just answered.

Scope: this question only. If asked about anything else — other subjects, personal
topics, general conversation — say you can only help with this question and stop.

How to explain:
- Lead with the idea the student is missing, not a restatement of the official answer.
  They have already read that and it did not land.
- Use a different angle each time: a concrete example, a diagram in words, working
  backwards from the answer, or an analogy.
- For maths, show the steps and name the operation at each one.
- For reading, quote the exact words in the text that decide the answer.
- If they picked a specific wrong option, explain the reasoning that leads there before
  correcting it. Being told why a mistake was tempting is what stops it recurring.

Tone: direct and warm. No praise for asking, no filler, no emoji. Two short paragraphs
at most. Assume they are capable and just need a different route in.

Never invent a different answer than the one marked correct. If you think the marked
answer is wrong, say so plainly rather than reasoning around it — that is a content bug
worth catching.`;

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_STORE_NAME);
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed === '') {
    await SecureStore.deleteItemAsync(KEY_STORE_NAME);
    return;
  }
  await SecureStore.setItemAsync(KEY_STORE_NAME, trimmed, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function isTutorConfigured(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TutorTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Strip LaTeX to plain text — the model reads it fine and it keeps the payload small. */
function flatten(text: string): string {
  return parseMixed(text)
    .map((segment) => (segment.kind === 'text' ? segment.value : toPlainText(segment.nodes)))
    .join('');
}

/**
 * Everything the model is allowed to see.
 *
 * Built explicitly field by field rather than by spreading the item, so a new
 * field added to `Item` later cannot silently start being transmitted.
 */
export function buildContext(item: Item, studentResponse: string): string {
  const parts: string[] = [];

  if (item.stimulus) parts.push(`Text:\n${flatten(item.stimulus)}`);
  if (item.stimulusB) parts.push(`Second text:\n${flatten(item.stimulusB)}`);
  if (item.figure) parts.push(`Figure data:\n${JSON.stringify(item.figure)}`);

  parts.push(`Question:\n${flatten(item.stem)}`);

  if (item.choices) {
    parts.push(
      `Choices:\n${item.choices.map((c) => `${c.id}. ${flatten(c.text)}`).join('\n')}`
    );
  }

  const key = Array.isArray(item.answer) ? item.answer.join(' or ') : item.answer;
  parts.push(`Correct answer: ${key}`);
  parts.push(`The student answered: ${studentResponse || '(no answer)'}`);
  parts.push(`Official explanation:\n${flatten(item.rationale)}`);

  return parts.join('\n\n');
}

export type TutorResult =
  | { ok: true; reply: string }
  | { ok: false; reason: 'no_key' | 'offline' | 'rate_limited' | 'error'; message: string };

/**
 * Ask a follow-up question about one item.
 *
 * Returns a typed failure rather than throwing: the caller is a UI component in
 * the middle of a session, and an unhandled rejection there would interrupt
 * practice over an optional extra.
 */
export async function askTutor(params: {
  item: Item;
  studentResponse: string;
  history: TutorTurn[];
  question: string;
  signal?: AbortSignal;
}): Promise<TutorResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      reason: 'no_key',
      message: 'Add an Anthropic API key in Settings to use this.',
    };
  }

  const context = buildContext(params.item, params.studentResponse);

  // T-13: nothing personal may cross the network boundary, ever.
  try {
    assertClean({ context, history: params.history, question: params.question });
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Blocked by the privacy check.',
    };
  }

  const trimmedHistory = params.history.slice(-(MAX_TURNS * 2));
  const messages = [
    { role: 'user' as const, content: `${context}\n\n---\n\n${params.question}` },
    ...trimmedHistory.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  // First message carries the context; later ones continue the thread.
  const body = {
    model: MODEL,
    max_tokens: 700,
    system: TUTOR_SYSTEM_PROMPT,
    messages: trimmedHistory.length === 0 ? messages.slice(0, 1) : [
      { role: 'user' as const, content: context },
      ...trimmedHistory,
      { role: 'user' as const, content: params.question },
    ],
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (response.status === 429) {
      return { ok: false, reason: 'rate_limited', message: 'Rate limited. Try again shortly.' };
    }
    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        reason: 'error',
        message: `Request failed (${response.status}). ${detail.slice(0, 160)}`,
      };
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const reply = (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    return reply
      ? { ok: true, reply }
      : { ok: false, reason: 'error', message: 'Empty response.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Distinguishing "no network" matters: the UI should say the feature is
    // unavailable right now, not that something went wrong.
    const offline = /network|fetch|Failed to fetch|ENOTFOUND|ETIMEDOUT/i.test(message);
    return {
      ok: false,
      reason: offline ? 'offline' : 'error',
      message: offline
        ? 'No connection. The rest of the session works offline as normal.'
        : message,
    };
  }
}

/** Openers offered under a wrong answer, so the student needn't compose one. */
export const SUGGESTED_PROMPTS = [
  'Explain this a different way.',
  'Why is my answer wrong?',
  'What should I have noticed first?',
  'Show me the steps.',
] as const;
