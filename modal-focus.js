const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const modalState = new WeakMap();

function focusableElements(modal) {
  return [...modal.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) =>
    !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0,
  );
}

export function openModal(modal, initialFocus) {
  if (!modal?.parentElement) return;
  closeModal(modal);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const siblings = [...modal.parentElement.children]
    .filter((element) => element !== modal)
    .map((element) => ({ element, wasInert: element.inert }));
  for (const { element } of siblings) element.inert = true;

  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;
    const elements = focusableElements(modal);
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;
    if (!modal.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  document.addEventListener('keydown', trapFocus, true);
  modalState.set(modal, { siblings, trapFocus });
  (initialFocus || focusableElements(modal)[0])?.focus({ preventScroll: true });
}

export function closeModal(modal, returnFocus = null) {
  const state = modalState.get(modal);
  if (state) {
    document.removeEventListener('keydown', state.trapFocus, true);
    for (const { element, wasInert } of state.siblings) element.inert = wasInert;
    modalState.delete(modal);
  }
  if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) {
    returnFocus.focus({ preventScroll: true });
  }
}
