export const BALANCE_CHANGED_EVENT = 'crm:balance-changed'

export function notifyBalanceChanged() {
  window.dispatchEvent(new CustomEvent(BALANCE_CHANGED_EVENT))
}
