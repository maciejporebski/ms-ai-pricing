import { applyFilters } from "../lib/data.js";

const FILTER_FIELDS = [
  ["provider", "Provider"],
  ["model", "Model"],
  ["region", "Region"],
  ["category", "Category"],
];

// Shown when the active filters intersect to zero rows. Works out which single
// filter, if relaxed, would bring results back, and offers one-click fixes.
export default function NoResults({ records, filters, regionLabels, setFilter, clearAll }) {
  const active = FILTER_FIELDS.filter(([k]) => filters[k]);

  const suggestions = [];
  for (const [key, label] of active) {
    const relaxed = applyFilters(records, { ...filters, [key]: "" });
    if (relaxed.length > 0) {
      const shown = key === "region" ? regionLabels.get(filters[key]) || filters[key] : filters[key];
      suggestions.push({ key, label, value: shown, count: relaxed.length });
    }
  }

  const provisionedConflict = filters.model && filters.category === "PTU";

  return (
    <div className="no-results" data-testid="no-results">
      <h3>No prices match all of your filters</h3>

      {provisionedConflict && (
        <p className="nr-note">
          Heads up: <strong>Provisioned / PTU</strong> throughput is billed <em>per PTU</em>,
          not per individual model — Azure publishes one provisioned rate per provider, listed
          under the model <strong>“All models”</strong>. Clear the <strong>Model</strong> filter
          to see provisioned pricing.
        </p>
      )}

      {suggestions.length > 0 ? (
        <>
          <p>Try removing one filter to get results:</p>
          <div className="nr-actions">
            {suggestions.map((s) => (
              <button key={s.key} type="button" onClick={() => setFilter({ [s.key]: "" })}>
                Clear {s.label} “{s.value}” → {s.count} rows
              </button>
            ))}
          </div>
        </>
      ) : (
        <p>No combination of the current filters has data. Reset and start over.</p>
      )}

      <button type="button" className="nr-reset" onClick={clearAll}>Reset all filters</button>
    </div>
  );
}
