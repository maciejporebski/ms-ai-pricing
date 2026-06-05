import { useMemo, useState } from "react";
import { buildModelPricing, fmtUSD, fmtNum } from "../lib/data.js";

function num(v) {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function Calculator({ records }) {
  const [inM, setInM] = useState("10");
  const [outM, setOutM] = useState("2");
  const [cachedM, setCachedM] = useState("0");

  const inputM = num(inM);
  const outputM = num(outM);
  const cachedMv = num(cachedM);

  const results = useMemo(() => {
    const pricing = buildModelPricing(records);
    const rows = pricing.map((m) => {
      const inP = m.prices.Input?.price;
      const outP = m.prices.Output?.price;
      const cachedP = m.prices["Cached Input"]?.price;
      const warnings = [];
      let cost = 0;
      let complete = true;
      if (inputM > 0) {
        if (inP == null) { warnings.push("no input price"); complete = false; }
        else cost += inputM * inP;
      }
      if (outputM > 0) {
        if (outP == null) { warnings.push("no output price"); complete = false; }
        else cost += outputM * outP;
      }
      if (cachedMv > 0) {
        if (cachedP == null) { warnings.push("no cached price"); complete = false; }
        else cost += cachedMv * cachedP;
      }
      return {
        key: `${m.provider}|${m.model}|${m.deployment}`,
        provider: m.provider, model: m.model, deployment: m.deployment,
        lowConfidence: m.lowConfidence,
        inP, outP, cachedP, cost, complete, warnings,
      };
    });
    // Only rank rows that have at least one priced component used.
    const usable = rows.filter((r) => r.cost > 0 || (inputM + outputM + cachedMv === 0));
    usable.sort((a, b) => a.cost - b.cost);
    return usable;
  }, [records, inputM, outputM, cachedMv]);

  return (
    <div className="calc" data-testid="calculator">
      <p className="table-hint">
        Enter expected <strong>monthly</strong> usage in millions of tokens. Costs use the
        current filters (provider, region, deployment…), so narrow them first for an
        apples-to-apples comparison. Rows are ranked cheapest first.
      </p>
      <div className="calc-inputs">
        <label className="filter">
          <span>Input (M tokens/mo)</span>
          <input data-testid="calc-input" type="number" min="0" value={inM}
            onChange={(e) => setInM(e.target.value)} />
        </label>
        <label className="filter">
          <span>Output (M tokens/mo)</span>
          <input data-testid="calc-output" type="number" min="0" value={outM}
            onChange={(e) => setOutM(e.target.value)} />
        </label>
        <label className="filter">
          <span>Cached input (M tokens/mo)</span>
          <input data-testid="calc-cached" type="number" min="0" value={cachedM}
            onChange={(e) => setCachedM(e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="pt" data-testid="calc-table">
          <thead>
            <tr>
              <th>#</th><th>Provider</th><th>Model</th><th>Deployment</th>
              <th>Input $/1M</th><th>Output $/1M</th><th>Cached $/1M</th>
              <th>Est. monthly cost</th>
            </tr>
          </thead>
          <tbody>
            {results.slice(0, 300).map((r, i) => (
              <tr key={r.key} className={r.complete ? "" : "partial"}>
                <td>{i + 1}</td>
                <td>{r.provider}</td>
                <td>{r.model}{r.lowConfidence ? " ⚠️" : ""}</td>
                <td>{r.deployment}</td>
                <td>{fmtUSD(r.inP)}</td>
                <td>{fmtUSD(r.outP)}</td>
                <td>{fmtUSD(r.cachedP)}</td>
                <td className="calc-cost" data-testid="calc-cost">
                  {fmtUSD(r.cost, 2)}
                  {!r.complete && (
                    <span className="warn" title={r.warnings.join(", ")}> (partial)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length > 300 && (
          <p className="empty-note">Showing cheapest 300 of {fmtNum(results.length)} — narrow filters to see more.</p>
        )}
        {results.length === 0 && <p className="empty-note">No token-priced models match the current filters.</p>}
      </div>
    </div>
  );
}
