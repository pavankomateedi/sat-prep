/**
 * In-module state for a timed test: answers, marks, eliminated choices, and
 * where the student is.
 *
 * These are the tools Bluebook gives every test-taker, and every paid prep
 * product replicates. Practising without them trains a different task: a
 * student who never learns to eliminate two options and move on is rehearsing
 * a strategy they cannot use on the day.
 *
 * Kept as pure reducer-style functions so the whole interaction model can be
 * unit-tested without mounting a screen — the navigation and review logic is
 * fiddly enough to be worth testing directly.
 */

export interface ModuleQuestionState {
  itemId: string;
  /** Chosen answer, or '' if unanswered. */
  response: string;
  /** Flagged for another look before the module ends. */
  marked: boolean;
  /** Choice ids the student has struck through. */
  eliminated: string[];
  /** Milliseconds spent with this question on screen, accumulated. */
  timeSpentMs: number;
}

export interface ModuleState {
  questions: ModuleQuestionState[];
  currentIndex: number;
  /** True while the end-of-module review screen is showing. */
  reviewing: boolean;
}

export function createModuleState(itemIds: readonly string[]): ModuleState {
  return {
    questions: itemIds.map((itemId) => ({
      itemId,
      response: '',
      marked: false,
      eliminated: [],
      timeSpentMs: 0,
    })),
    currentIndex: 0,
    reviewing: false,
  };
}

function updateAt(
  state: ModuleState,
  index: number,
  change: (q: ModuleQuestionState) => ModuleQuestionState
): ModuleState {
  if (index < 0 || index >= state.questions.length) return state;
  const questions = state.questions.slice();
  questions[index] = change(questions[index]!);
  return { ...state, questions };
}

export function answer(state: ModuleState, response: string): ModuleState {
  return updateAt(state, state.currentIndex, (q) => ({
    ...q,
    response,
    // Choosing an option you had struck through is a deliberate change of mind,
    // so clear that elimination rather than showing it both selected and
    // crossed out.
    eliminated: q.eliminated.filter((id) => id !== response),
  }));
}

export function clearAnswer(state: ModuleState): ModuleState {
  return updateAt(state, state.currentIndex, (q) => ({ ...q, response: '' }));
}

export function toggleMark(state: ModuleState): ModuleState {
  return updateAt(state, state.currentIndex, (q) => ({ ...q, marked: !q.marked }));
}

/**
 * Strike through or restore a choice.
 *
 * Eliminating the currently-selected option also clears the selection — you
 * cannot have crossed out the answer you are giving.
 */
export function toggleEliminated(state: ModuleState, choiceId: string): ModuleState {
  return updateAt(state, state.currentIndex, (q) => {
    const already = q.eliminated.includes(choiceId);
    return {
      ...q,
      eliminated: already
        ? q.eliminated.filter((id) => id !== choiceId)
        : [...q.eliminated, choiceId],
      response: !already && q.response === choiceId ? '' : q.response,
    };
  });
}

export function addTime(state: ModuleState, index: number, ms: number): ModuleState {
  return updateAt(state, index, (q) => ({ ...q, timeSpentMs: q.timeSpentMs + Math.max(0, ms) }));
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function goTo(state: ModuleState, index: number): ModuleState {
  if (index < 0 || index >= state.questions.length) return state;
  return { ...state, currentIndex: index, reviewing: false };
}

export function next(state: ModuleState): ModuleState {
  // Past the last question, the review screen is the natural destination —
  // that is where Bluebook lands you too.
  if (state.currentIndex >= state.questions.length - 1) {
    return { ...state, reviewing: true };
  }
  return { ...state, currentIndex: state.currentIndex + 1 };
}

export function previous(state: ModuleState): ModuleState {
  if (state.reviewing) return { ...state, reviewing: false };
  return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };
}

export function openReview(state: ModuleState): ModuleState {
  return { ...state, reviewing: true };
}

/** First unanswered question, or null when everything is answered. */
export function firstUnanswered(state: ModuleState): number | null {
  const index = state.questions.findIndex((q) => q.response === '');
  return index === -1 ? null : index;
}

/** First marked question, or null. */
export function firstMarked(state: ModuleState): number | null {
  const index = state.questions.findIndex((q) => q.marked);
  return index === -1 ? null : index;
}

export interface ModuleProgress {
  answered: number;
  unanswered: number;
  marked: number;
  total: number;
  /** Ready to submit: everything answered and nothing left flagged. */
  complete: boolean;
}

export function progress(state: ModuleState): ModuleProgress {
  const answered = state.questions.filter((q) => q.response !== '').length;
  const marked = state.questions.filter((q) => q.marked).length;
  return {
    answered,
    unanswered: state.questions.length - answered,
    marked,
    total: state.questions.length,
    complete: answered === state.questions.length && marked === 0,
  };
}

/** Answers keyed by item id, for scoring. */
export function responses(state: ModuleState): Map<string, string> {
  return new Map(state.questions.map((q) => [q.itemId, q.response]));
}

export function currentQuestion(state: ModuleState): ModuleQuestionState | undefined {
  return state.questions[state.currentIndex];
}
