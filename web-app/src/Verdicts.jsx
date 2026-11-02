import { useEffect, useState } from "react";
import useApi from "./useApi.js";
import Select from "./Select.jsx";
import Combobox from "./Combobox.jsx";

const VERDICT_OPTIONS = ["No action", "Warning", "Penalty", "Disqualification"];

// Always offered in the Reporter and Accused dropdowns, on top of the driver names
const PINNED = ["Steward"];

const ERRORS = {
  invalid_round: "Round must be a whole number within the championship's rounds.",
  invalid_incident: "Describe the incident (up to 200 characters).",
  invalid_reporter: "Enter the reporter.",
  invalid_accused_driver: "Enter the accused driver.",
  invalid_verdict: "Pick a verdict.",
  invalid_detail: "Detail is too long (100 characters max).",
  invalid_points: "Points must be a whole number from -99 to 99.",
  championship_not_found: "That championship no longer exists.",
  not_authenticated: "Your session expired. Reload and log in again.",
  not_authorized: "Your session expired. Reload and log in again.",
  driver_not_found:
  "Points can only go to a driver listed in this championship's Driver Status. Pick a listed driver, or add them there first.",
  driver_ambiguous: "Two drivers in this championship share that name, so the points can't be applied. Fix the duplicate in Driver Status.",
};

const EMPTY = {
  round: "",
  incident: "",
  reporter: "",
  accusedDriver: "",
  verdict: VERDICT_OPTIONS[0],
  detail: "",
  points: "",
};

function formatPoints(v) {
  return v.points ? String(v.points) : "—";
}

export default function Verdicts({ championship }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data: rows, error } = useApi(
    `/api/championships/${championship.id}/verdicts`,
    reloadKey
  );
  const { data: drivers } = useApi(`/api/championships/${championship.id}/drivers`);
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
  const setValue = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const driverNames = drivers?.map((d) => d.name) ?? [];

  function cancel() {
    setAdding(false);
    setSaveError(null);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/championships/${championship.id}/verdicts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round: Number(form.round),
          incident: form.incident,
          reporter: form.reporter,
          accusedDriver: form.accusedDriver,
          verdict: form.verdict,
          detail: form.detail,
          points: form.points === "" ? 0 : Number(form.points),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(ERRORS[body.error] ?? "Couldn't save the verdict. Try again.");
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
          <h2>Verdicts</h2>
          <p className="muted">{championship.name}</p>
        </div>
        {!adding && (
          <button className="btn small" onClick={() => setAdding(true)}>
            Add verdict
          </button>
        )}
      </div>

      {adding && (
        <form className="form inline-form" onSubmit={submit}>
          <label className="field">
            Round
            <input
              type="number"
              min="1"
              max={championship.rounds}
              step="1"
              value={form.round}
              onChange={set("round")}
              required
            />
          </label>
          <label className="field">
            Incident
            <input
              value={form.incident}
              onChange={set("incident")}
              maxLength={200}
              placeholder="Lap 3, Turn 1 contact"
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              Reporter
              <Combobox
                value={form.reporter}
                onChange={setValue("reporter")}
                options={driverNames}
                pinned={PINNED}
                maxLength={60}
                required
              />
            </label>
            <label className="field">
              Accused driver
              <Combobox
                value={form.accusedDriver}
                onChange={setValue("accusedDriver")}
                options={driverNames}
                pinned={PINNED}
                maxLength={60}
                required
              />
            </label>
          </div>

          <div className="field-row">
            <div className="field">
              <span>Verdict</span>
              <Select
                value={form.verdict}
                options={VERDICT_OPTIONS}
                onChange={setValue("verdict")}
                ariaLabel="Verdict"
              />
            </div>
            <label className="field">
              Points (to accused driver)
              <input
                type="number"
                min="-99"
                max="99"
                step="1"
                value={form.points}
                onChange={set("points")}
              />
            </label>
          </div>
          <label className="field">
            Detail (optional)
            <input
              value={form.detail}
              onChange={set("detail")}
              maxLength={100}
              placeholder="+5s"
            />
          </label>

          <div className="form-actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save verdict"}
            </button>
            <button className="btn ghost" type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
          {saveError && <p className="error" role="alert">{saveError}</p>}
        </form>
      )}

      {error && <p className="error">Couldn't load verdicts.</p>}
      {rows?.length === 0 && <p className="muted">No verdicts yet.</p>}
      {rows?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Incident</th>
                <th>Reporter</th>
                <th>Accused driver</th>
                <th>Verdict</th>
                <th>Detail</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{v.round}</td>
                  <td>{v.incident}</td>
                  <td>
                    {v.reporter && (
                      <span className="chip chip-reporting">{v.reporter}</span>
                    )}
                  </td>
                  <td>
                    {v.accusedDriver && (
                      <span className="chip chip-accused">{v.accusedDriver}</span>
                    )}
                  </td>
                  <td>{v.verdict}</td>
                  <td>{v.detail}</td>
                  <td>{formatPoints(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}