import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface SheetData {
  columns: string[];
  rows: Record<string, string | number | boolean>[];
}

async function fetchSheet(name: string): Promise<SheetData> {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

  const response = await fetch(`/api/sheet?name=${encodeURIComponent(name)}`, { headers });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `No se pudieron cargar los datos de: ${name}`);
  }
  
  return response.json();
}

export function useSheetData(sheetName: string) {
  return useQuery({
    queryKey: ['sheet', sheetName],
    queryFn: () => fetchSheet(sheetName),
    enabled: !!sheetName,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export function useAddRow(sheetName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rowData: Record<string, any>) => {
      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(rowData)
      });
      if (!res.ok) throw new Error('No se pudo crear el registro');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet', sheetName] });
    }
  });
}

export function useUpdateRow(sheetName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rowData: Record<string, any>) => {
      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(rowData)
      });
      if (!res.ok) throw new Error('No se pudo actualizar el registro');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet', sheetName] });
    }
  });
}

export function useDeleteRow(sheetName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}&_rowIndex=${rowIndex}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('No se pudo eliminar el registro');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet', sheetName] });
    }
  });
}
