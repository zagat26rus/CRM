export function notifyBalanceChanged() {
  try {
    window.dispatchEvent(new CustomEvent('fixnet:balance-changed'))
  } catch {}
}
