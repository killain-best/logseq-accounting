import { useState, type KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  ariaLabel?: string
}

/**
 * 可输入可下拉的组合框。
 * 为什么不用原生 datalist：Chromium 会按输入框当前值过滤 datalist 选项，
 * 预填值后下拉只剩匹配项（用户实测只能看到一个选项）。
 * 这里聚焦时展示全部选项，输入时按「包含」过滤，仍允许任意新值。
 */
export default function ComboInput({ value, onChange, options, placeholder, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [hi, setHi] = useState(0)

  const kw = value.trim().toLowerCase()
  const filtered = typed && kw ? options.filter((o) => o.toLowerCase().includes(kw)) : options
  const safeHi = Math.min(hi, Math.max(filtered.length - 1, 0))

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setTyped(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (!open) return // 交给表单提交
      e.stopPropagation()
      const exact = options.some((o) => o === value)
      if (filtered.length > 0 && typed && !exact) {
        e.preventDefault()
        pick(filtered[safeHi])
      } else {
        setOpen(false) // 已是选项值或全新值：让表单正常提交
      }
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation() // 先关下拉，不触发整个面板的 Esc 关闭
      setOpen(false)
    }
  }

  return (
    <div className="combo">
      <input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        onFocus={() => {
          setOpen(true)
          setTyped(false)
          setHi(0)
        }}
        onChange={(e) => {
          onChange(e.target.value)
          setTyped(true)
          setOpen(true)
          setHi(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="combo-list" role="listbox">
          {filtered.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                className={`combo-item ${i === safeHi ? 'hi' : ''} ${o === value ? 'sel' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault() // 保持 input 焦点，避免先触发 blur
                  pick(o)
                }}
                onMouseEnter={() => setHi(i)}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
