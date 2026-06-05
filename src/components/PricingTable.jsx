import { useMemo } from "react";
import { buildMatrix, fmtUSD, TOKEN_DIRECTIONS } from "../lib/data.js";

const DIR_ABBR = { Input: "In", Output: "Out", "Cached Input": "Cached" };

function Cell({ cell }) {
  if (!cell) return <td className="pt-cell empty">—</td>;
  return (
    <td className="pt-cell">
      {TOKEN_DIRECTIONS.map((dir) => {
        const p = cell[dir];
        if (!p) return null;
        return (
          <div key={dir} className="pt-price" title={p.varies ? `Varies by region: ${fmtUSD(p.min)}–${fmtUSD(p.max)} (${p.count} meters)` : p.sample.meterName}>
            <span className="pt-dir">{DIR_ABBR[dir]}</span>
            <span className="pt-val">{fmtUSD(p.price)}{p.varies ? "*" : ""}</span>
          </div>
        );
      })}
    </td>
  );
}

export default function PricingTable({ records, onSelectModel }) {
  const { rows, deployments } = useMemo(() => buildMatrix(records), [records]);

  if (rows.length === 0) {
    return <p className="empty-note">No token-priced models match the current filters.</p>;
  }

  return (
    <div className="table-wrap">
      <p className="table-hint">
        Prices are USD per 1M tokens. <strong>In</strong> = input, <strong>Out</strong> = output,
        <strong> Cached</strong> = cached input. <strong>*</strong> = price varies across regions
        (hover for range); pick a region to pin it. Click a model for raw meter details.
      </p>
      <table className="pt" data-testid="pricing-table">
        <thead>
          <tr>
            <th className="pt-sticky">Provider</th>
            <th className="pt-sticky2">Model</th>
            {deployments.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.provider}|${row.model}`}>
              <td className="pt-sticky pt-prov">{row.provider}</td>
              <td className="pt-sticky2 pt-model">
                <button type="button" className="link" onClick={() => onSelectModel(row)}>
                  {row.model}
                </button>
              </td>
              {deployments.map((d) => (
                <Cell key={d} cell={row.cells[d]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
