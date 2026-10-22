import { api } from '@nav/api/client';
import { useApiData } from '@nav/hooks/useApiData';

const loadDefaults = (signal: AbortSignal) => api.getSettings(signal);

export function useVisibilityDefaults() {
  return useApiData(loadDefaults);
}
