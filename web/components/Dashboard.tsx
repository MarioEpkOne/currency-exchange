'use client';

import { useState } from 'react';
import { ConvertForm } from './ConvertForm';
import { StatsPanel } from './StatsPanel';

/**
 * Client coordinator: a successful conversion bumps `statsVersion`, which the
 * StatsPanel watches and re-fetches on — so usage stats refresh automatically.
 */
export function Dashboard() {
  const [statsVersion, setStatsVersion] = useState(0);

  return (
    <>
      <div className="card">
        <ConvertForm onConverted={() => setStatsVersion((v) => v + 1)} />
      </div>
      <StatsPanel refreshSignal={statsVersion} />
    </>
  );
}
