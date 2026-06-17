import { Dashboard } from '../components/Dashboard';

export default function Home() {
  return (
    <main className="container">
      <h1 className="title">Currency Exchange</h1>
      <p className="subtitle">
        Live exchange rates, accurate to your currency&apos;s decimal places.
      </p>

      <Dashboard />
    </main>
  );
}
