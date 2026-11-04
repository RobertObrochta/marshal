import { useEffect, useState } from "react";
import useApi from "./useApi.js";
import Select from "./Select.jsx";
 
const ERRORS = {
  invalid_name: "Enter the driver's name (up to 60 characters).",
  reserved_name: "\"Steward\" is reserved and can't be used as a driver name.",
  invalid_number: "Car number must be a whole number from 1 to 999.",
  invalid_points: "Points must be a whole number from -9999 to 9999.",
  duplicate_name: "A driver with that name is already in this championship.",
  duplicate_number: "That car number is already taken in this championship.",
  championship_ended: "This championship has been ended. Reopen it from History to make changes.",
  championship_not_found: "That championship no longer exists.",
  not_authenticated: "Your session expired. Reload and log in again.",
  not_authorized: "Your session expired. Reload and log in again.",
};
 
const EMPTY = { name: "", number: "", points: "" };
 
export default function DriverStatus({ championship }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data: rows, error } = useApi(
    `/api/championships/${championship.id}/drivers`,
    reloadKey
  );
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
 
  // Switching championships closes and clears the form
  useEffect(() => {
    setAdding(false);
    setForm(EMPTY);
    setSaveError(null);
  }, [championship.id]);
 
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
 
  function cancel() {
    setAdding(false);
    setSaveError(null);
  }
 
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/championships/${championship.id}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          number: Number(form.number),
          points: form.points === "" ? 0 : Number(form.points),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(ERRORS[body.error] ?? "Couldn't save the driver. Try again.");
        return;
      }
      setForm(EMPTY);
      setAdding(false);
      setReloadKey((k) => k + 1);
    } catch {
      setSaveError("Can't reach the server.");
    } finally {
      setBusy(false);
    }
  }
 
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Driver Status</h2>
          <p className="muted">{championship.name}</p>
        </div>
        {!adding && (
          <button className="btn small" onClick={() => setAdding(true)}>
            Add driver
          </button>
        )}
      </div>
 
      {adding && (
        <form className="form inline-form" onSubmit={submit}>
          <label className="field">
            Name
            <input
              value={form.name}
              onChange={set("name")}
              maxLength={60}
              placeholder="Driver name"
              required
            />
          </label>
          <div className="field-row">
            <label className="field">
              Car #
              <input
                type="number"
                min="1"
                max="999"
                step="1"
                value={form.number}
                onChange={set("number")}
                required
              />
            </label>
            <label className="field">
              Starting points (optional)
              <input
                type="number"
                min="-9999"
                max="9999"
                step="1"
                value={form.points}
                onChange={set("points")}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save driver"}
            </button>
            <button className="btn ghost" type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
          {saveError && <p className="error" role="alert">{saveError}</p>}
        </form>
      )}
 
      {error && <p className="error">Couldn't load drivers.</p>}
      {rows?.length === 0 && <p className="muted">No drivers yet.</p>}
      {rows?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>#</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.number}</td>
                  <td>{d.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}