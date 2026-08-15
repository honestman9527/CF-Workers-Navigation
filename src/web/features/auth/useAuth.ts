import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@nav/api/client';

export function useAuth() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      await api.me(undefined, signal);
      setAuthed(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setAuthed(false);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return {
    authed,
    loading,
    async login(password: string) {
      await api.login(password);
      setAuthed(true);
    },
    async logout() {
      try {
        await api.logout();
      } catch (error) {
        if (!(error instanceof ApiError)) {
          throw error;
        }
      }
      setAuthed(false);
    },
  };
}
