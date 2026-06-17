import { Suspense } from 'react';
import { ConvertForm } from '../components/ConvertForm';
import { StatsPanel } from '../components/StatsPanel';

export default function Home() {
  return (
    <main className="container">
      <h1 className="title">Currency Exchange</h1>
      <p className="subtitle">
        Live exchange rates, accurate to your currency&apos;s decimal places.
      </p>

      <div className="card">
        <ConvertForm />
      </div>

      <Suspense
        fallback={
          <div className="card" style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Loading statistics…
          </div>
        }
      >
        <StatsPanel />
      </Suspense>
    </main>
  );
}
