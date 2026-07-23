'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'No se pudo iniciar sesión');
        return;
      }

      // `refresh()` reevalúa el middleware con la cookie recién puesta.
      router.replace('/');
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border border-t-[3px] border-t-accent bg-card p-8"
      >
        <h1 className="text-xl font-bold text-text">Dashboard Comercial</h1>
        <p className="mt-1 text-xs text-dim">ISARCO · Pipeline CRM</p>

        <label htmlFor="password" className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-dim">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent-border"
        />

        {error ? <p className="mt-3 text-xs font-medium text-red">{error}</p> : null}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {loading ? 'Verificando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
