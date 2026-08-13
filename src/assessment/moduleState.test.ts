import { describe, expect, it } from 'vitest';
import {
  addTime,
  answer,
  clearAnswer,
  createModuleState,
  currentQuestion,
  firstMarked,
  firstUnanswered,
  goTo,
  next,
  openReview,
  previous,
  progress,
  responses,
  toggleEliminated,
  toggleMark,
} from './moduleState';

const ITEMS = ['q1', 'q2', 'q3', 'q4'];
const fresh = () => createModuleState(ITEMS);

describe('answering', () => {
  it('records an answer on the current question only', () => {
    const state = answer(fresh(), 'B');
    expect(state.questions[0]!.response).toBe('B');
    expect(state.questions[1]!.response).toBe('');
  });

  it('allows changing and clearing an answer', () => {
    let state = answer(fresh(), 'B');
    state = answer(state, 'C');
    expect(state.questions[0]!.response).toBe('C');
    state = clearAnswer(state);
    expect(state.questions[0]!.response).toBe('');
  });

  it('exposes answers keyed by item id for scoring', () => {
    let state = answer(fresh(), 'A');
    state = answer(goTo(state, 2), 'D');
    const map = responses(state);
    expect(map.get('q1')).toBe('A');
    expect(map.get('q3')).toBe('D');
    expect(map.get('q2')).toBe('');
  });
});

describe('answer eliminator', () => {
  it('strikes through and restores a choice', () => {
    let state = toggleEliminated(fresh(), 'A');
    expect(state.questions[0]!.eliminated).toEqual(['A']);
    state = toggleEliminated(state, 'A');
    expect(state.questions[0]!.eliminated).toEqual([]);
  });

  it('clears the selection when the selected choice is eliminated', () => {
    // You cannot have crossed out the answer you are giving.
    let state = answer(fresh(), 'C');
    state = toggleEliminated(state, 'C');
    expect(state.questions[0]!.response).toBe('');
    expect(state.questions[0]!.eliminated).toEqual(['C']);
  });

  it('un-eliminates a choice that is then selected', () => {
    let state = toggleEliminated(fresh(), 'D');
    state = answer(state, 'D');
    expect(state.questions[0]!.response).toBe('D');
    expect(state.questions[0]!.eliminated).toEqual([]);
  });

  it('keeps eliminations per question', () => {
    let state = toggleEliminated(fresh(), 'A');
    state = toggleEliminated(goTo(state, 1), 'B');
    expect(state.questions[0]!.eliminated).toEqual(['A']);
    expect(state.questions[1]!.eliminated).toEqual(['B']);
  });
});

describe('mark for review', () => {
  it('toggles the flag on the current question', () => {
    let state = toggleMark(fresh());
    expect(state.questions[0]!.marked).toBe(true);
    state = toggleMark(state);
    expect(state.questions[0]!.marked).toBe(false);
  });

  it('finds the first marked question', () => {
    const state = toggleMark(goTo(fresh(), 2));
    expect(firstMarked(state)).toBe(2);
    expect(firstMarked(fresh())).toBeNull();
  });
});

describe('navigation', () => {
  it('moves forward and back', () => {
    let state = next(fresh());
    expect(state.currentIndex).toBe(1);
    state = previous(state);
    expect(state.currentIndex).toBe(0);
  });

  it('does not move before the first question', () => {
    expect(previous(fresh()).currentIndex).toBe(0);
  });

  it('opens the review screen after the last question', () => {
    const state = next(goTo(fresh(), ITEMS.length - 1));
    expect(state.reviewing).toBe(true);
    expect(state.currentIndex).toBe(ITEMS.length - 1);
  });

  it('returns from review to the question rather than skipping back one', () => {
    const state = previous(openReview(goTo(fresh(), 2)));
    expect(state.reviewing).toBe(false);
    expect(state.currentIndex).toBe(2);
  });

  it('jumps to any question and leaves review', () => {
    const state = goTo(openReview(fresh()), 3);
    expect(state.currentIndex).toBe(3);
    expect(state.reviewing).toBe(false);
  });

  it('ignores out-of-range jumps instead of crashing', () => {
    expect(goTo(fresh(), -1).currentIndex).toBe(0);
    expect(goTo(fresh(), 99).currentIndex).toBe(0);
  });

  it('finds the first unanswered question', () => {
    let state = answer(fresh(), 'A');
    state = answer(goTo(state, 1), 'B');
    expect(firstUnanswered(state)).toBe(2);
  });
});

describe('progress', () => {
  it('counts answered, unanswered, and marked', () => {
    let state = answer(fresh(), 'A');
    state = toggleMark(goTo(state, 1));

    const p = progress(state);
    expect(p.answered).toBe(1);
    expect(p.unanswered).toBe(3);
    expect(p.marked).toBe(1);
    expect(p.total).toBe(4);
    expect(p.complete).toBe(false);
  });

  it('is only complete when nothing is unanswered or still flagged', () => {
    let state = fresh();
    for (let i = 0; i < ITEMS.length; i += 1) state = answer(goTo(state, i), 'A');
    expect(progress(state).complete).toBe(true);

    // A flag left on means the student wanted another look.
    expect(progress(toggleMark(state)).complete).toBe(false);
  });
});

describe('time tracking', () => {
  it('accumulates time per question', () => {
    let state = addTime(fresh(), 0, 4_000);
    state = addTime(state, 0, 2_500);
    state = addTime(state, 1, 1_000);
    expect(state.questions[0]!.timeSpentMs).toBe(6_500);
    expect(state.questions[1]!.timeSpentMs).toBe(1_000);
  });

  it('ignores negative durations from a clock adjustment', () => {
    expect(addTime(fresh(), 0, -5_000).questions[0]!.timeSpentMs).toBe(0);
  });
});

describe('state integrity', () => {
  it('never mutates the previous state', () => {
    const before = fresh();
    const after = answer(before, 'A');
    expect(before.questions[0]!.response).toBe('');
    expect(after).not.toBe(before);
  });

  it('exposes the current question', () => {
    expect(currentQuestion(goTo(fresh(), 2))!.itemId).toBe('q3');
  });
});
