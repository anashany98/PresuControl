import { useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { Inbox } from 'lucide-react'

export interface DashboardTab {
  id: string
  label: string
  icon: LucideIcon
  count: number
  content: ReactNode
  iconColor?: string
}

interface DashboardTabsProps {
  tabs: DashboardTab[]
}

export function DashboardTabs({ tabs }: DashboardTabsProps) {
  const tabsWithData = tabs.filter(t => t.count > 0)
  const defaultTab = tabsWithData[0] || tabs[0]

  const [activeTabId, setActiveTabId] = useState<string>(defaultTab?.id || tabs[0]?.id)

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex(t => t.id === activeTabId)
    const enabledTabs = tabs.filter(t => t.count > 0)
    const enabledIds = new Set(enabledTabs.map(t => t.id))

    let nextId: string | null = null
    if (e.key === 'ArrowRight') {
      for (let i = 1; i <= tabs.length; i++) {
        const idx = (currentIndex + i) % tabs.length
        if (enabledIds.has(tabs[idx].id)) { nextId = tabs[idx].id; break }
      }
    } else if (e.key === 'ArrowLeft') {
      for (let i = 1; i <= tabs.length; i++) {
        const idx = (currentIndex - i + tabs.length) % tabs.length
        if (enabledIds.has(tabs[idx].id)) { nextId = tabs[idx].id; break }
      }
    }

    if (nextId && nextId !== activeTabId) {
      e.preventDefault()
      setActiveTabId(nextId)
      tabRefs.current[nextId]?.focus()
    }
  }

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  if (tabs.every(t => t.count === 0)) {
    return (
      <EmptyState
        icon={Inbox}
        title="Sin registros"
        description="No hay elementos en ninguna categoría."
      />
    )
  }

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="border-b border-border overflow-x-auto" role="tablist" aria-label="Secciones del dashboard" onKeyDown={handleKeyDown}>
        <div className="flex min-w-max">
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId
            const isEmpty = tab.count === 0

            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => !isEmpty && setActiveTabId(tab.id)}
                ref={el => { tabRefs.current[tab.id] = el }}
                className={`
                  flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap
                  border-b-2 transition-colors duration-150
                  ${isActive
                    ? 'border-brand text-ink font-semibold'
                    : isEmpty
                      ? 'border-transparent text-ink-muted opacity-50 cursor-not-allowed'
                      : 'border-transparent text-ink-muted hover:text-ink cursor-pointer'
                  }
                `}
                disabled={isEmpty}
              >
                <tab.icon size={14} className={tab.iconColor || 'text-ink-muted'} />
                <span>{tab.label}</span>
                <span className={`
                  inline-flex items-center justify-center min-w-[20px] h-5 text-xs font-medium
                  rounded-full px-1.5
                  ${isEmpty
                    ? 'bg-muted text-ink-muted opacity-50'
                    : 'bg-muted text-ink'
                  }
                `}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="py-3" role="tabpanel" id={`panel-${activeTab.id}`} aria-labelledby={`tab-${activeTab.id}`}>
        <div
          key={activeTab.id}
          className="transition-opacity duration-200"
          style={{ opacity: 1 }}
        >
          {activeTab.content}
        </div>
      </div>
    </div>
  )
}