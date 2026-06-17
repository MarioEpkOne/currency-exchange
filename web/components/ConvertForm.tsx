'use client';

import { useState, useEffect } from 'react';
import { getCurrencies, convert, ApiClientError } from '../lib/api';
import type { ConvertResult, CurrenciesResponse } from '@currency/core';

type FormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: ConvertResult }
  | { status: 'error'; code: string; message: string }
  | { status: 'unavailable'; message: string };

export function ConvertForm() {
  const [currencies, setCurrencies] = useState<CurrenciesResponse | null>(null);
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('EUR');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<FormState>({ status: 'idle' });

  useEffect(() => {
    getCurrencies()
      .then(setCurrencies)
      .catch(() => {
        setState({ status: 'unavailable', message: 'Could not load currency list.' });
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'loading' });
    try {
      const result = await convert(from, to, amount);
      setState({ status: 'success', result });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.httpStatus === 503) {
          setState({ status: 'unavailable', message: err.message });
        } else {
          setState({ status: 'error', code: err.code, message: err.message });
        }
      } else {
        setState({ status: 'error', code: 'UNKNOWN', message: 'An unexpected error occurred.' });
      }
    }
  };

  const currencyOptions = currencies
    ? Object.entries(currencies.currencies).map(([code, name]) => (
        <option key={code} value={code}>
          {code} — {name}
        </option>
      ))
    : null;

  return (
    <div>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="form-row">
          <div>
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              required
            />
          </div>
          <div>
            <label htmlFor="from">From</label>
            <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {currencyOptions}
            </select>
          </div>
          <div>
            <label htmlFor="to">To</label>
            <select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
              {currencyOptions}
            </select>
          </div>
        </div>
        <button className="btn" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Converting…' : 'Convert'}
        </button>
      </form>

      {state.status === 'success' && <ResultCard result={state.result} />}

      {state.status === 'error' && (
        <div className="error-box">
          <strong>{state.code}</strong>: {state.message}
        </div>
      )}

      {state.status === 'unavailable' && <div className="unavailable-box">{state.message}</div>}
    </div>
  );
}

function ResultCard({ result }: { result: ConvertResult }) {
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="result-value">
        {result.result} {result.to}
        {result.stale && <span className="stale-badge">stale</span>}
      </div>
      <div className="result-meta">
        {result.amount} {result.from} at rate {result.rate}
        {' · '}
        as of {new Date(result.asOf).toLocaleString()}
      </div>
    </div>
  );
}
