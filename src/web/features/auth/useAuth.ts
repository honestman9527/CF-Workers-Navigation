import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError, invalidateApiRequests } from '@nav/api/client';

export function useAuth() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const authRef = useRef(false);
  const transition = useCallback((value: boolean) => {
    authRef.current = value;
    generation.current += 1;
    invalidateApiRequests();
    setAuthed(value);
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const current = generation.current;
      try {
        await api.me(undefined, signal);
        if (current === generation.current && !signal?.aborted && !authRef.current)
          transition(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (current === generation.current && !signal?.aborted && authRef.current)
          transition(false);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [transition],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const check = () => {
      if (document.visibilityState === 'visible') void refresh(controller.signal);
    };
    const expired = () => {
      if (authRef.current) transition(false);
    };
    window.addEventListener('focus', check);
    window.addEventListener('nav-session-expired', expired);
    const timer = window.setInterval(check, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('nav-session-expired', expired);
    };
  }, [refresh, transition]);

  return {
    authed,
    loading,
    async login(password: string) {
      await api.login(password);
      transition(true);
    },
    async logout() {
      try {
        await api.logout();
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
      transition(false);
    },
  };
}
