import { useEffect, useMemo, useState } from "react";
import {
  loadData, applyFilters, buildRegionLabels, fmtNum,
} from "./lib/data.js";
import { readQuery, writeQuery } from "./lib/url.js";
import { toCsv, download } from "./lib/csv.js";
import Filters from "./components/Filters.jsx";
import PricingTable from "./components/PricingTable.jsx";
import ModelDetail from "./components/ModelDetail.jsx";
import NoResults from "./components/NoResults.jsx";

const FILTER_KEYS = ["provider", "model", "region", "category", "search", "hideLowConfidence"];
const EMPTY = {
  provider: "", model: "", region: "", category: "",
  search: "", hideLowConfidence: false,
};

function StalenessBanner({ meta }) {
  if (!meta?.generatedAt) return null;
  const gen = new Date(meta.generatedAt);
  const ageH = (Date.now() - gen.getTime()) / 3.6e6;
  const stale = ageH > 72;
  return (
    <div className={`staleness ${stale ? "stale" : ""}`} data-testid="staleness">
      Data snapshot: {gen.toLocaleString()}
      {stale && <strong> — over 72h old, may be outdated</strong>}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState({ records: null, meta: null, error: null });
  const [filters, setFilters] = useState({ ...EMPTY, ...readQuery(FILTER_KEYS) });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    loadData()
      .then(({ records, meta }) => setState({ records, meta, error: null }))
      .catch((err) => setState({ records: null, meta: null, error: err.message }));
  }, []);

  useEffect(() => {
    writeQuery(filters);
  }, [filters]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const records = state.records;
  const regionLabels = useMemo(() => (records ? buildRegionLabels(records) : new Map()), [records]);
  const filtered = useMemo(
    () => (records ? applyFilters(records, filters) : []),
    [records, filters]
  );
  // PTU rows used to graft Provisioned columns onto each model row. Scoped only by
  // provider/region (PTU is provider-wide), so the model/category filters don't
  // hide it.
  const ptuRecords = useMemo(() => {
    if (!records) return [];
    return applyFilters(records, { provider: filters.provider, region: filters.region })
      .filter((r) => r.category === "PTU");
  }, [records, filters.provider, filters.region]);

  if (state.error) {
    return (
      <div className="app">
        <div className="error">
          <h1>Could not load pricing data</h1>
          <p>{state.error}</p>
          <p className="muted">Run <code>npm run fetch-data</code> to generate the snapshot.</p>
        </div>
      </div>
    );
  }

  if (!records) {
    return <div className="app"><div className="loading">Loading Azure Foundry pricing…</div></div>;
  }

  const exportFiltered = () => {
    const csv = toCsv(filtered, [
      "provider", "model", "deployment", "direction", "category",
      "region", "unit", "price", "pricePer1M", "meterName", "skuName", "effectiveDate",
    ]);
    download("azure-foundry-pricing-filtered.csv", csv);
  };

  return (
    <div className="app">
      <header className="app-head">
        <h1>Azure AI Foundry Model Pricing Explorer</h1>
        <p className="subtitle">
          Retail prices from the Azure Retail Prices API refreshed daily. Pricing information does not guarantee model availability, some models have pricing information available ahead of model availability.
        </p>
        <StalenessBanner meta={state.meta} />
      </header>

      <Filters
        records={records}
        filters={filters}
        setFilter={setFilter}
        regionLabels={regionLabels}
        resultCount={filtered.length}
      />

      <nav className="toolbar">
        {filters.region && <span className="result-count" data-testid="result-count">{filtered.length} rows</span>}
        <button type="button" className="export" onClick={exportFiltered} disabled={!filters.region}>
          Export filtered CSV
        </button>
      </nav>

      {!filters.region ? (
        <div className="region-prompt" data-testid="region-prompt">
          <h3>Select a region to view pricing</h3>
          <p className="muted">
            Prices vary by Azure region, so choose a <strong>Region</strong> above to see model
            pricing. Global pricing is included automatically for the region you pick.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <NoResults
          records={records}
          filters={filters}
          regionLabels={regionLabels}
          setFilter={setFilter}
          clearAll={() => setFilter({ ...EMPTY })}
        />
      ) : (
        <PricingTable records={filtered} selectedCategory={filters.category} ptuRecords={ptuRecords} onSelectModel={setSelected} />
      )}

      <footer className="app-foot">
        <p className="muted small">
          Retail USD estimates only. Prices exclude discounts, reservations, enterprise
          agreements, taxes, and account-specific pricing. Source:{" "}
          <a href="https://prices.azure.com/api/retail/prices" target="_blank" rel="noreferrer">
            Azure Retail Prices API
          </a>.
        </p>
      </footer>

      <ModelDetail allRecords={records} selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
