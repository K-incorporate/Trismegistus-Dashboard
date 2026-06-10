import { useEffect, useState } from "react";
import type { FilterOptions, ObsFilters } from "@/observability/lib/types";
import { OBS_SERVER_BASE } from "@/observability/lib/config";

interface Props {
  filters: ObsFilters;
  onFiltersChange: (f: ObsFilters) => void;
}

const EMPTY_OPTIONS: FilterOptions = {
  source_apps: [],
  session_ids: [],
  hook_event_types: [],
};

export function FilterPanel({ filters, onFiltersChange }: Props) {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_OPTIONS);

  useEffect(() => {
    async function fetchFilterOptions() {
      try {
        const res = await fetch(`${OBS_SERVER_BASE}/events/filter-options`);
        if (res.ok) {
          const data = (await res.json()) as FilterOptions;
          setFilterOptions(data);
        }
      } catch {
        // server may be offline
      }
    }

    void fetchFilterOptions();
    const id = setInterval(() => void fetchFilterOptions(), 10000);
    return () => clearInterval(id);
  }, []);

  const hasActiveFilters = filters.sourceApp || filters.sessionId || filters.eventType;

  function clearFilters() {
    onFiltersChange({ sourceApp: "", sessionId: "", eventType: "" });
  }

  return (
    <div className="bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] border-b-2 border-[var(--theme-primary)] px-3 py-3 shadow-lg">
      <div className="flex flex-wrap gap-3 items-end sm:flex-row flex-col">
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-bold text-[var(--theme-primary)] mb-1">
            Source App
          </label>
          <select
            className="w-full px-3 py-2 text-sm border border-[var(--theme-primary)] rounded-lg bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)]"
            value={filters.sourceApp}
            onChange={(e) => onFiltersChange({ ...filters, sourceApp: e.target.value })}
          >
            <option value="">All Sources</option>
            {filterOptions.source_apps.map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <label className="block text-sm font-bold text-[var(--theme-primary)] mb-1">
            Session ID
          </label>
          <select
            className="w-full px-3 py-2 text-sm border border-[var(--theme-primary)] rounded-lg bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)]"
            value={filters.sessionId}
            onChange={(e) => onFiltersChange({ ...filters, sessionId: e.target.value })}
          >
            <option value="">All Sessions</option>
            {filterOptions.session_ids.map((session) => (
              <option key={session} value={session}>
                {session.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <label className="block text-sm font-bold text-[var(--theme-primary)] mb-1">
            Event Type
          </label>
          <select
            className="w-full px-3 py-2 text-sm border border-[var(--theme-primary)] rounded-lg bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)]"
            value={filters.eventType}
            onChange={(e) => onFiltersChange({ ...filters, eventType: e.target.value })}
          >
            <option value="">All Events</option>
            {filterOptions.hook_event_types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            className="px-4 py-2 text-sm font-bold border border-[var(--theme-primary)] rounded-lg bg-[var(--theme-primary)] text-[var(--theme-bg-primary)] hover:opacity-80 transition-opacity"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
