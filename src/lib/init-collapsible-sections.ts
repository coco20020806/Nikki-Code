/** 为 admin-page.ts 等纯 DOM 页面初始化与 CollapsibleSection 一致的可折叠面板 */
export function initCollapsibleSections(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-collapsible]').forEach((section) => {
    const trigger = section.querySelector<HTMLButtonElement>('[data-collapsible-trigger]')
    const panel = section.querySelector<HTMLElement>('[data-collapsible-panel]')
    const chevron = section.querySelector<HTMLElement>('[data-collapsible-chevron]')
    if (!trigger || !panel) return

    const defaultOpen = section.getAttribute('data-default-open') !== 'false'
    let open = defaultOpen

    const setOpen = (next: boolean) => {
      open = next
      panel.style.gridTemplateRows = next ? '1fr' : '0fr'
      trigger.setAttribute('aria-expanded', String(next))
      chevron?.classList.toggle('rotate-180', next)
    }

    setOpen(open)
    trigger.addEventListener('click', () => setOpen(!open))
  })
}
