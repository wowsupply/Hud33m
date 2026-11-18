export const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
