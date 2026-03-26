import type { ReactNode } from 'react'

export default function SectionContentLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">{children}</div>
}
