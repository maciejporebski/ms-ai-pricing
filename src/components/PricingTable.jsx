import { useMemo } from "react";
import { buildCategoryMatrix, categoriesPresent, fmtUSD, CATEGORY_HINTS } from "../lib/data.js";

const DIR_ABBR = { Input: "In", Output: "Out", "Cached Input": "Cached" };

function Cell({ cell, seriesList, isToken }) {
  if (!cell) return <td className="pt-cell empty">—</td>;
  return (
    <td className="pt-cell">
      {seriesList.map((s) => {
        const p = cell[s];
        if (!p) return null;
        const label = isToken ? DIR_ABBR[s] || s : s;
        const title = p.varies
          ? `Varies by region: ${fmtUSD(p.min)}–${fmtUSD(p.max)} (${p.count} meters)`
          : p.sample.meterName;
        return (
          <div key={s} className="pt-price" title={title}>
            <span className="pt-dir">{label}</span>
            <span className="pt-val">{fmtUSD(p.price)}{p.varies ? "*" : ""}</span>
          </div>
        );
      })}
    </td>
  );
}

function CategorySection({ records, category, onSelectModel }) {
  const { rows, deployments, seriesList, isToken } = useMemo(
    () => buildCategoryMatrix(records, category),
    [records, category]
  );
  if (rows.length === 0) return null;

  return (
    <section className="pt-section" data-testid={`section-${category}`}>
      <h3 className="pt-section-title">
        {category} <span className="muted small">· {rows.length} models</span>
      </h3>
      <p className="table-hint">
        {CATEGORY_HINTS[category] || "Native unit pricing."}{" "}
        <strong>*</strong> = varies across regions (hover for range). Click a model for raw meters.
      </p>
      <div className="table-wrap">
        <table className="pt" data-testid={`table-${category}`}>
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
                  <Cell key={d} cell={row.cells[d]} seriesList={seriesList} isToken={isToken} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PricingTable({ records, selectedCategory, onSelectModel }) {
  // With a category filter active, show only that section; otherwise stack every
  // billing model present (Tokens, PTU, Images, Pages, …).
  const categories = selectedCategory ? [selectedCategory] : categoriesPresent(records);

  if (categories.length === 0) {
    return <p className="empty-note">No models match the current filters.</p>;
  }

  return (
    <div data-testid="pricing-table">
      {categories.map((c) => (
        <CategorySection key={c} records={records} category={c} onSelectModel={onSelectModel} />
      ))}
    </div>
  );
}
