/** Show or hide a loading overlay */
export function renderLoader(container: HTMLElement): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'loader-overlay hidden';
  overlay.innerHTML = '<div class="spinner"></div><p>Loading data...</p>';
  container.appendChild(overlay);
  return overlay;
}

export function showLoader(el: HTMLElement): void {
  el.classList.remove('hidden');
}

export function hideLoader(el: HTMLElement): void {
  el.classList.add('hidden');
}
