import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

export interface SheetRow extends Record<string, string | number | boolean | null | undefined> {
  _id: string;
}

export interface SheetData {
  columns: string[];
  rows: SheetRow[];
}

export const SHEET_QUERY_STALE_TIME_MS = 60 * 1000;
export const SHEET_QUERY_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export function getSheetQueryKey(sheetName: string) {
  return ['sheet', sheetName] as const;
}

export async function fetchSheet(name: string): Promise<SheetData> {
  const response = await fetch(`/api/sheet?name=${encodeURIComponent(name)}`, {
    credentials: 'include',
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `No se pudieron cargar los datos de: ${name}`);
  }
  
  return response.json();
}

export function prefetchSheetData(queryClient: QueryClient, sheetName: string) {
  return queryClient.prefetchQuery({
    queryKey: getSheetQueryKey(sheetName),
    queryFn: () => fetchSheet(sheetName),
    staleTime: SHEET_QUERY_STALE_TIME_MS,
  });
}

export function useSheetData(sheetName: string) {
  return useQuery({
    queryKey: getSheetQueryKey(sheetName),
    queryFn: () => fetchSheet(sheetName),
    enabled: !!sheetName,
    staleTime: SHEET_QUERY_STALE_TIME_MS,
    refetchInterval: SHEET_QUERY_REFETCH_INTERVAL_MS,
  });
}

function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

export function useAddRow(sheetName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rowData: Record<string, unknown>) => {
      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(rowData),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('No se pudo crear el registro');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getSheetQueryKey(sheetName) });
    }
  });
}

export function useUpdateRow(sheetName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rowData: Record<string, unknown>) => {
      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(rowData),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('No se pudo actualizar el registro');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getSheetQueryKey(sheetName) });
    }
  });
}

export function useDeleteRow(sheetName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rowId: string) => {
      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}&_id=${encodeURIComponent(rowId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('No se pudo eliminar el registro');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getSheetQueryKey(sheetName) });
    }
  });
}
