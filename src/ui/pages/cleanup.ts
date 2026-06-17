import { store } from '../../store/store';
import { formatBytes } from '../../utils/format';
import { uid } from '../../utils/format';
import type { CleanupRecommendation } from '../../types';

export function renderCleanup(container: HTMLElement): void {
  container.innerHTML = '';

  const header = document.createElement('h1');
  header.textContent = 'Storage Cleanup';
  container.appendChild(header);

  const { auth } = store.getState();
  if (!auth.isAuthenticated) {
    const msg = document.createElement('p');
    msg.className = 'info-message';
    msg.textContent = 'Please sign in to access cleanup tools.';
    container.appendChild(msg);
    return;
  }

  const intro = document.createElement('p');
  intro.textContent =
    'Review recommendations based on your site analysis, then take action to reclaim storage.';
  container.appendChild(intro);

  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn-primary';
  generateBtn.textContent = 'Generate Recommendations';
  generateBtn.addEventListener('click', generateRecommendations);
  container.appendChild(generateBtn);

  const recsContainer = document.createElement('div');
  recsContainer.id = 'recommendations';
  container.appendChild(recsContainer);

  function generateRecommendations(): void {
    const { sites, largeFiles, recycleBinItems } = store.getState();
    const recs: CleanupRecommendation[] = [];

    // Recommendation: empty recycle bins with significant content
    const recycleBySite = new Map<string, number>();
    recycleBinItems.forEach((item) => {
      recycleBySite.set(
        item.siteId,
        (recycleBySite.get(item.siteId) ?? 0) + item.size,
      );
    });
    recycleBySite.forEach((totalSize, siteId) => {
      if (totalSize > 50 * 1024 * 1024) {
        const site = sites.find((s) => s.id === siteId);
        recs.push({
          id: uid(),
          actionType: 'empty_recycle_bin',
          description: `Empty recycle bin for "${site?.displayName ?? siteId}" to reclaim ${formatBytes(totalSize)}.`,
          estimatedSavingsBytes: totalSize,
          targetSiteId: siteId,
          targetSiteName: site?.displayName ?? siteId,
          items: [],
          risk: 'medium',
        });
      }
    });

    // Recommendation: archive low-activity sites using > 1 GB
    sites.forEach((site) => {
      if (
        site.storageUsedInBytes > 1024 * 1024 * 1024 &&
        site.lastModifiedDateTime &&
        new Date(site.lastModifiedDateTime) <
          new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
      ) {
        recs.push({
          id: uid(),
          actionType: 'archive_site',
          description: `Consider archiving "${site.displayName}" — ${formatBytes(site.storageUsedInBytes)} used, inactive for 6+ months.`,
          estimatedSavingsBytes: site.storageUsedInBytes,
          targetSiteId: site.id,
          targetSiteName: site.displayName,
          items: [],
          risk: 'high',
        });
      }
    });

    // Recommendation: very large files
    largeFiles
      .filter((f) => f.size > 100 * 1024 * 1024)
      .forEach((f) => {
        recs.push({
          id: uid(),
          actionType: 'compress_files',
          description: `Review large file "${f.name}" (${formatBytes(f.size)}) in ${f.libraryName}.`,
          estimatedSavingsBytes: Math.floor(f.size * 0.3),
          targetSiteId: f.siteId,
          targetSiteName: f.siteName,
          items: [f.id],
          risk: 'low',
        });
      });

    store.dispatch({ type: 'SET_RECOMMENDATIONS', payload: recs });
    renderRecommendationsList(recs);
  }

  function renderRecommendationsList(recs: CleanupRecommendation[]): void {
    recsContainer.innerHTML = '';

    if (recs.length === 0) {
      recsContainer.innerHTML =
        '<p class="info-message">No recommendations yet. Run a site analysis first, then come back here.</p>';
      return;
    }

    const totalSavings = recs.reduce(
      (s, r) => s + r.estimatedSavingsBytes,
      0,
    );
    const summaryP = document.createElement('p');
    summaryP.innerHTML = `<strong>${recs.length} recommendations</strong> with potential savings of <strong>${formatBytes(totalSavings)}</strong>`;
    recsContainer.appendChild(summaryP);

    recs.forEach((rec) => {
      const card = document.createElement('div');
      card.className = `card recommendation risk-${rec.risk}`;
      card.innerHTML = `
        <div class="rec-header">
          <span class="risk-badge ${rec.risk}">${rec.risk.toUpperCase()}</span>
          <span class="rec-action-type">${rec.actionType.replace(/_/g, ' ')}</span>
        </div>
        <p>${rec.description}</p>
        <p class="rec-savings">Estimated savings: <strong>${formatBytes(rec.estimatedSavingsBytes)}</strong></p>
      `;
      recsContainer.appendChild(card);
    });
  }

  // If we already have recommendations, render them
  const existingRecs = store.getState().recommendations;
  if (existingRecs.length > 0) {
    renderRecommendationsList(existingRecs);
  }
}
