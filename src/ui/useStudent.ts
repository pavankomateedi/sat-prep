/**
 * Bootstrap hook: opens the database, loads content, and finds the student.
 *
 * Every screen needs the same three things before it can render, and all three
 * are async. Centralising them here keeps the loading and error states in one
 * place instead of repeated across five screens.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Student } from '../domain/types';
import { loadContentIfNeeded } from '../data/contentLoader';
import * as repo from '../data/repositories';

export interface BootstrapState {
  loading: boolean;
  student: Student | null;
  itemCount: number;
  error: string | null;
  reload: () => void;
}

export function useBootstrap(): BootstrapState {
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadContentIfNeeded();
        const [found, count] = await Promise.all([repo.getFirstStudent(), repo.itemCount()]);
        if (cancelled) return;
        setStudent(found);
        setItemCount(count);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { loading, student, itemCount, error, reload };
}
