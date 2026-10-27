// Minimal React render helper for jsdom tests (no @testing-library dependency).
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  return {
    container,
    rerender: (el) => act(() => { root.render(el) }),
    unmount: () => { act(() => root.unmount()); container.remove() },
    click: (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }),
    key: (key, target = window) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) }),
    type: (el, value) => act(() => {
      const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }),
    act,
  }
}
