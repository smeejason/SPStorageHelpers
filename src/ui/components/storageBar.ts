import { formatBytes, formatPercentage } from '../../utils/format';

/** Render a horizontal storage usage bar */
export function renderStorageBar(
  container: HTMLElement,
  usedBytes: number,
  totalBytes: number,
  label?: string,
): void {
  const pct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const barColor = pct > 90 ? '#d13438' : pct > 70 ? '#ff8c00' : '#0078d4';

  const wrapper = document.createElement('div');
  wrapper.className = 'storage-bar-wrapper';

  if (label) {
    const lbl = document.createElement('div');
    lbl.className = 'storage-bar-label';
    lbl.textContent = label;
    wrapper.appendChild(lbl);
  }

  const track = document.createElement('div');
  track.className = 'storage-bar-track';

  const fill = document.createElement('div');
  fill.className = 'storage-bar-fill';
  fill.style.width = `${Math.min(pct, 100)}%`;
  fill.style.backgroundColor = barColor;
  track.appendChild(fill);
  wrapper.appendChild(track);

  const info = document.createElement('div');
  info.className = 'storage-bar-info';
  info.textContent = `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)} (${formatPercentage(pct)})`;
  wrapper.appendChild(info);

  container.appendChild(wrapper);
}
