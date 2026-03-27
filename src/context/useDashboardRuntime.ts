import { useContext } from 'react'
import { DashboardRuntimeContext } from './dashboardRuntimeStore'
import type { DashboardRuntimeContextType } from './dashboardRuntimeStore'

export function useDashboardRuntime(): DashboardRuntimeContextType {
  const ctx = useContext(DashboardRuntimeContext)
  if (!ctx) throw new Error('useDashboardRuntime debe usarse dentro de DashboardRuntimeProvider')
  return ctx
}
