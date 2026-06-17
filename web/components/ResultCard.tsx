import type { ConvertResult } from '@currency/core';

type Props = {
  result: ConvertResult;
};

/**
 * Standalone result card — renders the conversion result, rate, asOf timestamp,
 * and a STALE badge when stale === true.
 */
export function ResultCard({ result }: Props) {
  return (
    <div className="card">
      <div className="result-value">
        {result.result} {result.to}
        {result.stale && <span className="stale-badge">stale rates</span>}
      </div>
      <div className="result-meta">
        <span>
          {result.amount} {result.from} at rate {result.rate}
        </span>
        <br />
        <span>as of {new Date(result.asOf).toLocaleString()}</span>
        {result.stale && (
          <span style={{ marginLeft: '0.5rem', color: '#d97706', fontSize: '0.8rem' }}>
            (rates may be outdated)
          </span>
        )}
      </div>
    </div>
  );
}
