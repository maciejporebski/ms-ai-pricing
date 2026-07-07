import { useMemo, useState } from "react";
import { buildCategoryMatrix, categoriesPresent, fmtUSD, CATEGORY_HINTS } from "../lib/data.js";

const DIR_ABBR = { Input: "In", Output: "Out", "Cached Input": "Cached" };

function Cell({ items }) {
  if (!items || items.length === 0) return <td className="pt-cell empty">—</td>;
  return (
    <td className="pt-cell">
      {items.map(({ key, p }) => {
        if (!p) return null;
        const label = DIR_ABBR[key] || key;
        const provisioned = /PTU|unit\//i.test(key);
        const title = p.varies
          ? `Varies by region: ${fmtUSD(p.min)}–${fmtUSD(p.max)} (${p.count} meters)`
          : p.sample.meterName;
        return (
          <div key={key} className={`pt-price${provisioned ? " pt-ptu" : ""}`} title={title}>
            <span className="pt-dir">{label}</span>
            <span className="pt-val">{fmtUSD(p.price)}{p.varies ? "*" : ""}</span>
          </div>
        );
      })}
    </td>
  );
}

// Sortable-by-price representative value for a deployment cell: the first
// (lowest-ranked, e.g. Input) series price — enough to give a stable, useful
// ordering without needing the user to pick which series to sort by.
function cellSortValue(row, dep) {
  const items = row.cells[dep];
  return items && items.length ? items[0]?.p?.price ?? null : null;
}

function compareRows(a, b, sort) {
  const { key, dir } = sort;
  let va, vb, isString = false;
  if (key === "provider") { va = a.provider; vb = b.provider; isString = true; }
  else if (key === "model") { va = a.model; vb = b.model; isString = true; }
  else { va = cellSortValue(a, key); vb = cellSortValue(b, key); }

  // Rows without a value for the sorted column always sink to the bottom,
  // regardless of sort direction.
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;

  const cmp = isString ? va.localeCompare(vb) : va - vb;
  return dir === "asc" ? cmp : -cmp;
}

function SortableHeader({ label, sortKey, sort, onSort, className = "" }) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th
      className={`${className} sortable${active ? " sorted" : ""}`.trim()}
      aria-sort={ariaSort}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="pt-sort-arrow">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
    </th>
  );
}

function CategorySection({ records, category, ptuRecords, onSelectModel }) {
  const { rows, deployments, augmented } = useMemo(
    () => buildCategoryMatrix(records, category, ptuRecords),
    [records, category, ptuRecords]
  );
  const [sort, setSort] = useState({ key: "provider", dir: "asc" });
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) =>
      compareRows(a, b, sort) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
    );
    return copy;
  }, [rows, sort]);
  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  if (rows.length === 0) return null;

  return (
    <section className="pt-section" data-testid={`section-${category}`}>
      <h3 className="pt-section-title">
        {category} <span className="muted small">· {rows.length} models</span>
      </h3>
      <p className="table-hint">
        {CATEGORY_HINTS[category] || "Native unit pricing."}{" "}
        {augmented && (
          <span>
            <strong className="pt-ptu">Provisioned</strong> columns are per-PTU rates for the model's
            provider.
          </span>
        )}
      </p>
      <div className="table-wrap">
        <table className="pt" data-testid={`table-${category}`}>
          <thead>
            <tr>
              <SortableHeader label="Provider" sortKey="provider" sort={sort} onSort={toggleSort} className="pt-sticky" />
              <SortableHeader label="Model" sortKey="model" sort={sort} onSort={toggleSort} className="pt-sticky2" />
              {deployments.map((d) => (
                <SortableHeader key={d} label={d} sortKey={d} sort={sort} onSort={toggleSort}
                  className={/Provisioned/.test(d) ? "pt-ptu-col" : ""} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={`${row.provider}|${row.model}`}>
                <td className="pt-sticky pt-prov">{row.provider}</td>
                <td className="pt-sticky2 pt-model">
                  <button type="button" className="link" onClick={() => onSelectModel(row)}>
                    {row.model}
                  </button>
                </td>
                {deployments.map((d) => (
                  <Cell key={d} items={row.cells[d]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PricingTable({ records, selectedCategory, ptuRecords, onSelectModel }) {
  // With a category filter active, show only that section. Otherwise stack every
  // non-PTU billing model (Tokens, Images, …) — PTU is integrated as Provisioned
  // columns in each model row, so it isn't shown as a separate "All models" table.
  const categories = useMemo(() => {
    if (selectedCategory) return [selectedCategory];
    const present = categoriesPresent(records);
    const nonPtu = present.filter((c) => c !== "PTU");
    return nonPtu.length ? nonPtu : present;
  }, [records, selectedCategory]);

  if (categories.length === 0) {
    return <p className="empty-note">No models match the current filters.</p>;
  }

  // Don't graft PTU columns when the user is explicitly viewing the PTU table.
  const augmentSource = selectedCategory === "PTU" ? null : ptuRecords;

  return (
    <div data-testid="pricing-table">
      {categories.map((c) => (
        <CategorySection
          key={c}
          records={records}
          category={c}
          ptuRecords={augmentSource}
          onSelectModel={onSelectModel}
        />
      ))}
    </div>
  );
}
