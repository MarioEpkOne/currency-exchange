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

export function ConvertForm({ onConverted }: { onConverted?: () => void }) {
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
      onConverted?.();
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

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  // Only the ISO code is shown (it's all that's needed and keeps the control
  // readable); the full name rides along as a tooltip for accessibility.
  const currencyOptions = currencies
    ? Object.entries(currencies.currencies).map(([code, name]) => (
        <option key={code} value={code} title={name}>
          {code}
        </option>
      ))
    : null;

  const disabled = state.status === 'loading' || currencies === null;

  return (
    <div>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            autoComplete="off"
            required
          />
        </div>

        <div className="currency-row">
          <div className="field">
            <label htmlFor="from">From</label>
            <div className="select-wrap">
              <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
                {currencyOptions}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="swap-btn"
            onClick={swap}
            aria-label="Swap currencies"
            title="Swap currencies"
          >
            ⇄
          </button>

          <div className="field">
            <label htmlFor="to">To</label>
            <div className="select-wrap">
              <select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
                {currencyOptions}
              </select>
            </div>
          </div>
        </div>

        <button className="btn" type="submit" disabled={disabled}>
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
    <div className="result">
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
