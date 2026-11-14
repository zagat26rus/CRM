export function downloadCsv(filename: string, rows: string[][]) {
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const bom = '\uFEFF'
  const body = rows.map((row) => row.map(escape).join(';')).join('\n')
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
