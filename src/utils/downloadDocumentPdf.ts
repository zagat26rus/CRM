function safePdfName(filename: string) {
  const base = filename.replace(/[<>:"/\\|?*]+/g, '_').trim() || 'document'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  if (images.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    let pending = images.length
    const done = () => {
      pending -= 1
      if (pending <= 0) resolve()
    }
    images.forEach((img) => {
      if (img.complete) done()
      else {
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      }
    })
  })
}

function mountPrintHtml(html: string): { target: HTMLElement; cleanup: () => void } {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const page = parsed.querySelector('.page')
  if (!page) throw new Error('Не удалось подготовить документ для PDF')

  const styleEl = document.createElement('style')
  styleEl.textContent = [
    ...Array.from(parsed.querySelectorAll('style')).map((s) => s.textContent || ''),
    `
      .pdf-capture-root {
        position: fixed;
        left: 0;
        top: 0;
        width: 210mm;
        background: #ffffff;
        color: #000000;
        z-index: 2147483647;
        pointer-events: none;
        transform: translateX(-12000px);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .pdf-capture-root, .pdf-capture-root * {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        opacity: 1 !important;
        -webkit-font-smoothing: auto;
        text-rendering: geometricPrecision;
      }
      .pdf-capture-root .page {
        margin: 0;
        padding: 0 0 16px;
        overflow: visible !important;
      }
      .pdf-capture-root .sign-block,
      .pdf-capture-root .sign-row,
      .pdf-capture-root .sign-field,
      .pdf-capture-root .sign-caption {
        overflow: visible !important;
      }
      .pdf-capture-root .sign-row { padding-bottom: 4px !important; }
      .pdf-capture-root .sign-caption {
        padding-bottom: 4px !important;
        line-height: 1.35 !important;
        min-height: 1.35em !important;
      }
      .pdf-capture-root .sign-value { padding-bottom: 6px !important; }
      .pdf-capture-root .sign-line {
        height: 1px !important;
        background: #000000 !important;
        border: none !important;
      }
    `,
  ].join('\n')

  const host = document.createElement('div')
  host.className = 'pdf-capture-root'
  host.setAttribute('aria-hidden', 'true')
  host.appendChild(page.cloneNode(true))

  document.head.appendChild(styleEl)
  document.body.appendChild(host)

  const target = host.querySelector('.page') as HTMLElement

  return {
    target,
    cleanup: () => {
      styleEl.remove()
      host.remove()
    },
  }
}

export async function downloadDocumentPdf(html: string, filename: string): Promise<void> {
  const { target, cleanup } = mountPrintHtml(html)

  try {
    try {
      await document.fonts?.ready
    } catch {
      // ignore
    }
    await waitForImages(target)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    const captureW = Math.ceil(target.scrollWidth)
    const pageRect = target.getBoundingClientRect()
    const lastCaption = target.querySelector('.sign-block .sign-row:last-child .sign-caption') as HTMLElement | null
    let captureH = Math.ceil(target.scrollHeight) + 20
    if (lastCaption) {
      const capRect = lastCaption.getBoundingClientRect()
      captureH = Math.max(captureH, Math.ceil(capRect.bottom - pageRect.top) + 12)
    }

    const canvas = await html2canvas(target, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: captureW,
      height: captureH,
      windowWidth: captureW,
      windowHeight: captureH,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      onclone: (_doc, element) => {
        element.style.background = '#ffffff'
        element.style.color = '#000000'
        element.querySelectorAll('*').forEach((node) => {
          const el = node as HTMLElement
          el.style.color = '#000000'
          el.style.opacity = '1'
        })
      },
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false })
    const pageW = 210
    const marginMm = 10
    const contentW = pageW - marginMm * 2
    const imgH = (canvas.height * contentW) / canvas.width
    pdf.addImage(imgData, 'PNG', marginMm, marginMm, contentW, imgH, undefined, 'NONE')
    pdf.save(safePdfName(filename))
  } finally {
    cleanup()
  }
}
