import { useEffect, useMemo, useRef, useState } from "react";
import { uniqueSorted } from "../lib/data.js";
import { UNIVERSAL_REGIONS, regionName } from "../lib/regions.js";

let comboUid = 0;

// Searchable dropdown: closed, it behaves like a normal picker showing the
// selected value. Opening it (click/focus) reveals a listbox with a live text
// filter, so typing narrows the options while the dropdown stays open.
function Combobox({ label, value, onChange, options, labels, placeholder = "All" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const idRef = useRef(`cb-${++comboUid}`);

  const optionLabel = (o) => (labels ? labels.get(o) || o : o);
  const selectedLabel = value ? optionLabel(value) : "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => optionLabel(o).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const openList = () => {
    setOpen(true);
    setQuery("");
    setActiveIndex(-1);
  };

  const pick = (o) => {
    onChange(o);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { openList(); return; }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && activeIndex >= 0 && activeIndex < filtered.length) pick(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="filter combobox" ref={rootRef}>
      <span id={`${idRef.current}-label`}>{label}</span>
      <div className="combobox-wrap">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${idRef.current}-listbox`}
          aria-labelledby={`${idRef.current}-label`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={open ? query : selectedLabel}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul className="combobox-list" id={`${idRef.current}-listbox`} role="listbox">
            <li
              role="option"
              aria-selected={value === ""}
              className={`combobox-option${value === "" ? " selected" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(""); }}
            >
              {placeholder}
            </li>
            {filtered.length === 0 && <li className="combobox-empty">No matches</li>}
            {filtered.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={value === o}
                className={`combobox-option${value === o ? " selected" : ""}${i === activeIndex ? " active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              >
                {optionLabel(o)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Filters({ records, filters, setFilter, regionLabels, resultCount }) {
  // Option lists derive from the full dataset so users can always change facets.
  const providers = uniqueSorted(records, "provider");
  // Real geographic regions only (Global/US Gov/empty are universal, not selectable),
  // sorted by friendly name.
  const regions = uniqueSorted(records, "region")
    .filter((r) => !UNIVERSAL_REGIONS.has(r))
    .sort((a, b) => regionName(a).localeCompare(regionName(b)));
  const categories = uniqueSorted(records, "category");
  // Models narrow to the chosen provider for a manageable list.
  const modelPool = filters.provider
    ? records.filter((r) => r.provider === filters.provider)
    : records;
  const models = uniqueSorted(modelPool, "model");

  return (
    <div className="filters" data-testid="filters">
      <Combobox label="Region *" value={filters.region} options={regions} labels={regionLabels}
        placeholder="Select a region…"
        onChange={(v) => setFilter({ region: v })} />
      <Combobox label="Provider" value={filters.provider} options={providers}
        onChange={(v) => setFilter({ provider: v, model: "" })} />
      <Combobox label="Model" value={filters.model} options={models}
        onChange={(v) => setFilter({ model: v })} />
      <Combobox label="Category" value={filters.category} options={categories}
        onChange={(v) => setFilter({ category: v })} />
      <label className="filter filter-search">
        <span>Search</span>
        <input type="text" value={filters.search} placeholder="model, meter, sku…"
          onChange={(e) => setFilter({ search: e.target.value })} />
      </label>
      <div className="filter-actions">
        <button type="button" onClick={() => setFilter({
          provider: "", model: "", region: "", category: "", search: "",
          hideLowConfidence: false,
        })}>Reset</button>
      </div>
    </div>
  );
}
