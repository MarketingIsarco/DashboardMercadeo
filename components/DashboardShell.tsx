'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { ensureChartsRegistered } from '@/components/charts/setup';
import { ComercialTab } from '@/components/tabs/ComercialTab';
import { ComparativoTab } from '@/components/tabs/ComparativoTab';
import { GerenciaTab } from '@/components/tabs/GerenciaTab';
import { MercadeoTab } from '@/components/tabs/MercadeoTab';
import { ResultadosTab } from '@/components/tabs/ResultadosTab';
import { applyFilters, availableMonths, availableYears, defaultFilters } from '@/lib/selectors';
import type { FilterState, TabProps } from '@/lib/selectors';
import type { DashboardData } from '@/lib/types';

ensureChartsRegistered();

const TABS = [
  { id: 'resultados', label: 'Resultados', Component: ResultadosTab },
  { id: 'mercadeo', label: 'Mercadeo', Component: MercadeoTab },
  { id: 'comercial', label: 'Comercial', Component: ComercialTab },
  { id: 'comp', label: 'Comparativo', Component: ComparativoTab },
  { id: 'gerencia', label: 'Gerencia', Component: GerenciaTab },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface Payload extends DashboardData {
  stale?: boolean;
}

export function DashboardShell() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>('resultados');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const load = useCallback(async (force: boolean) => {
    force ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/data${force ? '?refresh=1' : ''}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Error al cargar datos');
      setData(body as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const months = useMemo(() => (data ? availableMonths(data.leads) : []), [data]);
  const years = useMemo(() => (data ? availableYears(data.leads) : []), [data]);

  const filtered = useMemo(
    () => (data ? applyFilters(data.leads, filters, data.meta.digitalSources) : []),
    [data, filters],
  );

  const Active = TABS.find((t) => t.id === tab)!.Component;

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-border border-t-[3px] border-t-accent bg-accent-tint px-6 py-4 backdrop-blur">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text">Dashboard Comercial</h1>
          <p className="mt-0.5 text-xs text-dim">
            Pipeline CRM en vivo desde Pipedrive
            {data ? ` · ${data.total.toLocaleString('es-CO')} leads` : ''}
          </p>
        </div>

        {data ? (
          <span className="text-2xs text-muted">
            Actualizado{' '}
            {new Date(data.fetchedAt).toLocaleString('es-CO', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {data.stale ? ' · datos en caché' : ''}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="pill disabled:opacity-50"
        >
          {refreshing ? 'Actualizando…' : '↻ Actualizar'}
        </button>

        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' });
            window.location.href = '/login';
          }}
          className="pill"
        >
          Salir
        </button>

        <span className="whitespace-nowrap rounded-full border border-gold/70 bg-gold/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-gold">
          ISARCO
        </span>
      </header>

      <nav className="flex gap-1 border-b border-border bg-card px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-dim hover:text-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-5">
        {loading ? <Skeleton /> : null}

        {error && !data ? (
          <div className="section border-l-red">
            <h2 className="section-title text-red">No se pudo cargar el dashboard</h2>
            <p className="mt-1 text-xs text-dim">{error}</p>
            <button type="button" className="pill mt-3" onClick={() => void load(true)}>
              Reintentar
            </button>
          </div>
        ) : null}

        {data ? (
          <>
            <FilterBar
              filters={filters}
              onChange={setFilters}
              meta={data.meta}
              months={months}
              years={years}
              shown={filtered.length}
              total={data.leads.length}
            />
            {error ? (
              <p className="text-xs font-medium text-red">
                Mostrando datos en caché — la última actualización falló: {error}
              </p>
            ) : null}
            <TabView data={data} filtered={filtered} filters={filters} meta={data.meta} Active={Active} />
          </>
        ) : null}
      </main>
    </>
  );
}

function TabView({ Active, ...props }: TabProps & { Active: (p: TabProps) => JSX.Element }) {
  if (props.filtered.length === 0) {
    return (
      <div className="section">
        <h2 className="section-title">Sin resultados</h2>
        <p className="mt-1 text-xs text-dim">
          Ningún lead coincide con los filtros activos. Ajusta o limpia los filtros.
        </p>
      </div>
    );
  }
  return <Active {...props} />;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 animate-pulse rounded-xl border border-border bg-card" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-[10px] border border-border bg-card" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
      <p className="text-center text-xs text-muted">Cargando ~6.500 leads desde Pipedrive…</p>
    </div>
  );
}
