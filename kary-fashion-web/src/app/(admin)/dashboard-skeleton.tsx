export function DashboardSkeleton() {
  const block = "animate-pulse rounded-[var(--radius-card)] bg-white/70 border border-line";
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando datos del panel">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${block} h-[128px]`} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className={`${block} h-[360px] lg:col-span-5`} />
        <div className={`${block} h-[360px] lg:col-span-4`} />
        <div className={`${block} h-[360px] lg:col-span-3`} />
      </div>
    </div>
  );
}
