const TXN_BLOCK_CLASS = 'logseq-accounting-txn'
const TXN_PROPERTIES_CLASS = 'logseq-accounting-own-properties'
const TXN_EDIT_CLASS = 'logseq-accounting-edit-button'
const NATIVE_INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  '.bullet-container',
  '.block-left',
  '.block-properties',
  '.block-properties-container',
].join(',')

interface ClosestNode {
  closest<T extends Element = Element>(selectors: string): T | null
}

function isClosestNode(value: unknown): value is ClosestNode {
  return typeof value === 'object' && value !== null && typeof (value as { closest?: unknown }).closest === 'function'
}

export function clickedTransactionUuid(event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'>): string | null {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null
  if (!isClosestNode(event.target) || event.target.closest(NATIVE_INTERACTIVE_SELECTOR)) return null
  const block = event.target.closest<HTMLElement>(`.${TXN_BLOCK_CLASS}[blockid]`)
  if (!block || event.target.closest('[blockid]') !== block) return null
  return block.getAttribute('blockid')
}

function getHostDocument(): Document | null {
  try {
    return window.parent?.document ?? null
  } catch (cause) {
    console.warn('[logseq-accounting] cannot access host document', cause)
    return null
  }
}

function markTransactionBlocks(document: Document): void {
  const tags = document.querySelectorAll<HTMLAnchorElement>('a.tag[data-ref="账单"]')
  for (const tag of tags) {
    const block = tag.closest<HTMLElement>('[blockid]')
    if (!block) continue
    block.classList.add(TXN_BLOCK_CLASS)

    const propertyContainers = block.querySelectorAll<HTMLElement>('.block-properties, .block-properties-container')
    for (const container of propertyContainers) {
      if (container.closest('[blockid]') === block) container.classList.add(TXN_PROPERTIES_CLASS)
    }
    if (!block.querySelector(`.${TXN_EDIT_CLASS}`)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = TXN_EDIT_CLASS
      button.textContent = '编辑'
      button.setAttribute('aria-label', '编辑这笔账单')
      tag.insertAdjacentElement('afterend', button)
    }
  }
}

/** 从标签出发标记最近的真实块，避免 CSS :has() 匹配整条祖先链。 */
export function setupBlockPresentation(onEdit: (blockUuid: string) => void): void {
  const hostDocument = getHostDocument()
  if (!hostDocument?.body) return

  let scheduled = false
  const refresh = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      markTransactionBlocks(hostDocument)
    })
  }

  refresh()
  new MutationObserver(refresh).observe(hostDocument.body, { childList: true, subtree: true })

  hostDocument.addEventListener('pointerdown', (event) => {
    if (!isClosestNode(event.target) || !event.target.closest(`.${TXN_EDIT_CLASS}`)) return
    const block = event.target.closest<HTMLElement>(`.${TXN_BLOCK_CLASS}[blockid]`)
    const blockUuid = block?.getAttribute('blockid')
    if (!blockUuid) return
    event.preventDefault()
    event.stopPropagation()
    onEdit(blockUuid)
  }, true)
}
