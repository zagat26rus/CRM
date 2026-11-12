import { useEffect } from 'react'

/** Locks document scroll while a modal is mounted (stops iOS rubber-band / side swipe). */
export function useLockBodyScroll(locked = true) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyOverscroll = body.style.overscrollBehavior
    const scrollY = window.scrollY

    html.classList.add('modal-open')
    body.classList.add('modal-open')
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    // Keep visual position on iOS when locking
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'

    return () => {
      html.classList.remove('modal-open')
      body.classList.remove('modal-open')
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      body.style.overscrollBehavior = prevBodyOverscroll
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}

export default useLockBodyScroll
