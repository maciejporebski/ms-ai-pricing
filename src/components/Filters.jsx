import { uniqueSorted } from "../lib/data.js";

function Select({ label, value, onChange, options, labels }) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels ? labels.get(o) || o : o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Filters({ records, filters, setFilter, regionLabels, resultCount }) {
  // Option lists derive from the full dataset so users can always change facets.
  const providers = uniqueSorted(records, "provider");
  const regions = uniqueSorted(records, "region");
  const deployments = uniqueSorted(records, "deployment");
  const categories = uniqueSorted(records, "category");
  // Models narrow to the chosen provider for a manageable list.
  const modelPool = filters.provider
    ? records.filter((r) => r.provider === filters.provider)
    : records;
  const models = uniqueSorted(modelPool, "model");

  return (
    <div className="filters" data-testid="filters">
      <Select label="Provider" value={filters.provider} options={providers}
        onChange={(v) => setFilter({ provider: v, model: "" })} />
      <Select label="Model" value={filters.model} options={models}
        onChange={(v) => setFilter({ model: v })} />
      <Select label="Region" value={filters.region} options={regions} labels={regionLabels}
        onChange={(v) => setFilter({ region: v })} />
      <Select label="Deployment type" value={filters.deployment} options={deployments}
        onChange={(v) => setFilter({ deployment: v })} />
      <Select label="Category" value={filters.category} options={categories}
        onChange={(v) => setFilter({ category: v })} />
      <label className="filter filter-search">
        <span>Search</span>
        <input type="text" value={filters.search} placeholder="model, meter, sku…"
          onChange={(e) => setFilter({ search: e.target.value })} />
      </label>
      <label className="filter filter-check">
        <input type="checkbox" checked={!!filters.hideLowConfidence}
          onChange={(e) => setFilter({ hideLowConfidence: e.target.checked })} />
        <span>Hide low-confidence rows</span>
      </label>
      <div className="filter-actions">
        <span className="result-count" data-testid="result-count">{resultCount} rows</span>
        <button type="button" onClick={() => setFilter({
          provider: "", model: "", region: "", deployment: "", category: "", search: "",
          hideLowConfidence: false,
        })}>Reset</button>
      </div>
    </div>
  );
}
