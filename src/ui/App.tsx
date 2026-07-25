import { useEffect, useState, useSyncExternalStore } from 'react'
import { store, closeUI } from './store'
import { sdk } from '../logseq/sdk'
import TxnForm from './TxnForm'
import Dashboard from './Dashboard'

export default function App() {
  const view = useSyncExternalStore(store.sub, store.get)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // 跟随 Logseq 主题
  useEffect(() => {
    let mounted = true
    sdk.App.getUserConfigs?.()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((c: any) => {
        if (!mounted) return
        if (c?.preferredThemeMode === 'dark' || c?.preferredThemeMode === 'light') {
          setTheme(c.preferredThemeMode)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const off = sdk.App.onThemeModeChanged?.(({ mode }: any) => {
      if (mode === 'dark' || mode === 'light') setTheme(mode)
    })
    return () => {
      mounted = false
      if (typeof off === 'function') off()
    }
  }, [])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUI()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (view.kind === 'hidden') return null

  return (
    <div
      className="overlay"
      data-theme={theme}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeUI()
      }}
    >
      {view.kind === 'form' ? (
        <TxnForm mode={view.mode} blockUuid={view.blockUuid} />
      ) : (
        <Dashboard />
      )}
    </div>
  )
}
