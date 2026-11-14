/** Печать через скрытый iframe — без окна about:blank и лишних колонтитулов. */
export function openPrintWindow(html: string): boolean {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none'

  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!win || !doc) {
    iframe.remove()
    return false
  }

  doc.open()
  doc.write(html)
  doc.close()
  doc.title = '\u00a0'

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500)
  }

  const runPrint = () => {
    const doPrint = () => {
      doc.title = '\u00a0'
      win.focus()
      win.print()
      if ('onafterprint' in win) win.onafterprint = cleanup
      else cleanup()
    }

    const images = Array.from(doc.images)
    if (images.length === 0) {
      doPrint()
      return
    }

    let pending = images.length
    const done = () => {
      pending -= 1
      if (pending <= 0) doPrint()
    }

    images.forEach((img) => {
      if (img.complete) done()
      else {
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      }
    })
  }

  if (doc.readyState === 'complete') runPrint()
  else win.onload = runPrint

  return true
}
