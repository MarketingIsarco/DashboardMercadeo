'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import logoIsarco from '@/public/isarco-logo.png';
import { FilterBar } from '@/components/FilterBar';
import { ensureChartsRegistered } from '@/components/charts/setup';
import { ComercialInmTab } from '@/components/tabs/ComercialInmTab';
import { ComercialTab } from '@/components/tabs/ComercialTab';
import { ComparativoTab } from '@/components/tabs/ComparativoTab';
import { GerenciaTab } from '@/components/tabs/GerenciaTab';
import { MercadeoTab } from '@/components/tabs/MercadeoTab';
import { ResultadosTab } from '@/components/tabs/ResultadosTab';
import {
  applyFilters,
  availableMonths,
  availableYears,
  defaultFilters,
  ganadosDelPeriodo,
} from '@/lib/selectors';
import type { FilterState, TabProps } from '@/lib/selectors';
import type { DashboardData } from '@/lib/types';

ensureChartsRegistered();

const TABS = [
  { id: 'resultados', label: 'Resultados', Component: ResultadosTab },
  { id: 'mercadeo', label: 'Mercadeo', Component: MercadeoTab },
  // COIS: la pestaña "Comercial" de siempre, sin cambios.
  { id: 'comercial', label: 'Comercial COIS', Component: ComercialTab },
  // INM = inmobiliaria: sólo Oficinas, Locales, Bodegas, Coworking y Otros.
  { id: 'comercialInm', label: 'Comercial INM', Component: ComercialInmTab },
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

  // Mismos filtros, pero el periodo se mide por fecha de ganado.
  const ganados = useMemo(
    () => (data ? ganadosDelPeriodo(data.leads, filters, data.meta.digitalSources) : []),
    [data, filters],
  );

  // Asesores dueños de al menos un trato, para el filtro de la barra.
  const advisorOptions = useMemo(
    () => (data ? [...new Set(data.leads.map((l) => l.advisor))] : []),
    [data],
  );

  const Active = TABS.find((t) => t.id === tab)!.Component;

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-4 bg-grad-head px-6 py-3 shadow-[0_8px_24px_-10px_rgba(5,39,58,0.6)]">
        <span className="flex shrink-0 items-center rounded-[14px] bg-white px-3.5 py-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
          <Image
            src={logoIsarco}
            alt="ISARCO"
            priority
            className="h-9 w-auto shrink-0"
            sizes="120px"
          />
        </span>

        <span aria-hidden className="h-9 w-px shrink-0 bg-white/20" />

        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-[0.2px] text-white">Dashboard Comercial</h1>
          <p className="mt-0.5 text-xs font-medium text-[#b9dbe8]">
            Pipeline CRM en vivo desde Pipedrive
            {data ? ` · ${data.total.toLocaleString('es-CO')} leads` : ''}
          </p>
        </div>

        {data ? (
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-2xs font-semibold text-white">
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
          className="cursor-pointer rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/25 disabled:opacity-50"
        >
          {refreshing ? 'Actualizando…' : '↻ Actualizar'}
        </button>

        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth', { method: 'DELETE' });
            window.location.href = '/login';
          }}
          className="cursor-pointer rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/25"
        >
          Salir
        </button>
      </header>

      <nav className="mx-auto mt-5 max-w-[1400px] px-6">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-panel">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-[11px] px-5 py-2.5 text-[13px] font-bold tracking-[0.2px] transition-all duration-150 ${
                tab === t.id
                  ? 'bg-grad text-white shadow-tab'
                  : 'text-dim hover:bg-panel2 hover:text-accent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
              advisorOptions={advisorOptions}
            />
            {error ? (
              <p className="text-xs font-medium text-red">
                Mostrando datos en caché — la última actualización falló: {error}
              </p>
            ) : null}
            <TabView data={data} filtered={filtered} ganados={ganados} filters={filters} meta={data.meta} Active={Active} />
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
