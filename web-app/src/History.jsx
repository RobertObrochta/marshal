import { useState } from "react";
import useApi from "./useApi.js";
 
function formatDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
 
export default function History({ onChanged }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = useApi("/api/championships?status=ended", reloadKey);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
 
  // Most recently ended first
  const rows = data
    ? [...data].sort((a, b) => String(b.endedAt ?? "").localeCompare(String(a.endedAt ?? "")))
    : null;
 
  async function reopen(c) {
    setBusyId(c.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/championships/${c.id}/reopen`, { method: "POST" });
      if (!res.ok) {
        setActionError("Couldn't reopen the championship. Try again.");
        return;
      }
      setReloadKey((k) => k + 1);
      onChanged?.();
    } catch {
      setActionError("Can't reach the server.");
    } finally {
      setBusyId(null);
    }
  }
 
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>History</h2>
          <p className="muted">Ended championships. Reopen one to make it live again.</p>
        </div>
      </div>
 
      {error && <p className="error">Couldn't load history.</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {rows?.length === 0 && <p className="muted">No ended championships yet.</p>}
      {rows?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Championship</th>
                <th>Rounds</th>
                <th>Ended</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.rounds}</td>
                  <td>{formatDate(c.endedAt)}</td>
                  <td className="row-actions">
                    <button
                      className="btn small ghost"
                      disabled={busyId === c.id}
                      onClick={() => reopen(c)}
                    >
                      {busyId === c.id ? "Reopening…" : "Reopen"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}