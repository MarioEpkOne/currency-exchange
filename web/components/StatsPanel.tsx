import type { StatsResponse } from '@currency/core';
import { getStats } from '../lib/api';

/**
 * Server component — fetches stats on every request (no cache).
 * Shows total conversions, total sum in USD, and top target currency.
 */
export async function StatsPanel() {
  let stats: StatsResponse | null = null;
  try {
    stats = await getStats();
  } catch {
    // Stats unavailable — degrade gracefully, don't break the page
  }

  if (!stats) {
    return (
      <div className="card">
        <h2 className="title" style={{ fontSize: '1rem' }}>
          Usage Statistics
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Statistics unavailable.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>
        Usage Statistics
      </h2>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">{stats.totalCount.toLocaleString()}</div>
          <div className="stat-label">Total conversions</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">${stats.totalSumUSD}</div>
          <div className="stat-label">Total volume (USD)</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{stats.topCurrency ?? '—'}</div>
          <div className="stat-label">Top target currency</div>
        </div>
      </div>
    </div>
  );
}
