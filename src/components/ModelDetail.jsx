import { useMemo } from "react";
import { fmtUSD } from "../lib/data.js";
import { regionName } from "../lib/regions.js";
import { toCsv, download } from "../lib/csv.js";

export default function ModelDetail({ allRecords, selected, onClose }) {
  const rows = useMemo(() => {
    if (!selected) return [];
    return allRecords
      .filter((r) => r.provider === selected.provider && r.model === selected.model)
      .sort(
        (a, b) =>
          a.deployment.localeCompare(b.deployment) ||
          a.direction.localeCompare(b.direction) ||
          a.region.localeCompare(b.region)
      );
  }, [allRecords, selected]);

  if (!selected) return null;

  const exportRows = () => {
    const csv = toCsv(rows, [
      "provider", "model", "deployment", "direction", "category",
      "region", "location", "unit", "price", "pricePer1M",
      "meterName", "skuName", "effectiveDate",
    ]);
    download(`${selected.provider}-${selected.model}.csv`.replace(/[^\w.-]+/g, "_"), csv);
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} data-testid="model-detail">
        <header className="drawer-head">
          <div>
            <h2>{selected.model}</h2>
            <p className="muted">{selected.provider} · {rows.length} raw meters</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="drawer-close">×</button>
        </header>
        <p className="muted small">
          Raw Azure Retail meters behind this model. Use these to audit how the normalized
          prices above were derived.
        </p>
        <button type="button" className="btn" onClick={exportRows}>Export CSV</button>
        <div className="table-wrap">
          <table className="pt small">
            <thead>
              <tr>
                <th>Deployment</th><th>Direction</th><th>Region</th>
                <th>Price</th><th>Unit</th><th>Per 1M</th><th>Meter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.lowConfidence ? "partial" : ""}>
                  <td>{r.deployment}</td>
                  <td>{r.direction}</td>
                  <td title={r.location}>{r.region ? regionName(r.region) : "—"}</td>
                  <td>{fmtUSD(r.price)}</td>
                  <td>{r.unit}</td>
                  <td>{r.pricePer1M != null ? fmtUSD(r.pricePer1M) : "—"}</td>
                  <td className="meter" title={r.skuName}>{r.meterName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}
