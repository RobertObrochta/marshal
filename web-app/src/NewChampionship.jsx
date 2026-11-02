import { useState } from "react";

const ERRORS = {
  invalid_name: "Enter a championship name (up to 100 characters).",
  invalid_rounds: "Rounds must be a whole number from 1 to 99.",
  duplicate_name: "A championship with that name already exists.",
  not_authenticated: "Your session expired. Reload and log in again.",
  not_authorized: "Your session expired. Reload and log in again.",
};

export default function NewChampionship({ onCreated }) {
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/championships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rounds: Number(rounds) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[body.error] ?? "Couldn't save the championship. Try again.");
        return;
      }
      setCreated(body);
      setName("");
      setRounds("");
      onCreated();
    } catch {
      setError("Can't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>New championship</h2>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="S25: GT Europe"
            required
          />
        </label>
        <label className="field">
          Rounds
          <input
            type="number"
            min="1"
            max="99"
            step="1"
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
            required
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Create championship"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
        {created && <p className="ok">Created "{created.name}" with ID {created.id}.</p>}
      </form>
    </section>
  );
}