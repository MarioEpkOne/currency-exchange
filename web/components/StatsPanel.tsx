'use client';

import { useEffect, useState } from 'react';
import type { StatsResponse } from '@currency/core';
import { getStats } from '../lib/api';

type StatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: StatsResponse }
  | { status: 'error' };

/**
 * Client component — fetches stats on mount and re-fetches whenever
 * `refreshSignal` changes (incremented by the parent after a conversion),
 * so the panel updates automatically without a manual page refresh.
 */
export function StatsPanel({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [state, setState] = useState<StatsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Keep the previous numbers visible while re-fetching; only flip to the
    // loading skeleton on the very first load.
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));

    getStats()
      .then((stats) => {
        if (!cancelled) setState({ status: 'ready', stats });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
      });

    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  return (
    <section className="card stats-card" aria-live="polite">
      <h2 className="card-heading">Usage statistics</h2>

      {state.status === 'loading' && <p className="muted-text">Loading statistics…</p>}

      {state.status === 'error' && <p className="muted-text">Statistics unavailable.</p>}

      {state.status === 'ready' && (
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{state.stats.totalCount.toLocaleString()}</div>
            <div className="stat-label">Total conversions</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">${state.stats.totalSumUSD}</div>
            <div className="stat-label">Total volume (USD)</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{state.stats.topCurrency ?? '—'}</div>
            <div className="stat-label">Top target currency</div>
          </div>
        </div>
      )}
    </section>
  );
}
