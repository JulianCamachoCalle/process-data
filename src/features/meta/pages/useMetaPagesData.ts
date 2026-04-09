import { useQuery } from '@tanstack/react-query';
import type { MetaPagesPayload } from './types';

type MetaPagesFilters = {
  since: string;
  until: string;
};

export function getMetaPagesQueryKey(filters: MetaPagesFilters) {
  return ['meta-pages', filters.since, filters.until] as const;
}

export function useMetaPagesData(filters: MetaPagesFilters) {
  return useQuery({
    queryKey: getMetaPagesQueryKey(filters),
    queryFn: async (): Promise<MetaPagesPayload> => {
      const params = new URLSearchParams({
        resource: 'pages',
        limit: '25',
        max_pages: '3',
      });

      if (filters.since) params.set('since', filters.since);
      if (filters.until) params.set('until', filters.until);

      const response = await fetch(`/api/meta/ads/sync?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      const payload = (await response.json()) as MetaPagesPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo cargar Meta Pages.');
      }

      return payload;
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
