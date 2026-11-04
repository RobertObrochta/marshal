import { useEffect, useRef, useState } from "react";
import useApi from "./useApi.js";

const PAGES = ["Verdicts", "Driver Status"];

export default function ChampionshipsMenu({ onSelect, reloadKey, onEnded }) {
  const { data: championships, error } = useApi("/api/championships", reloadKey);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null); // championship id
  const [confirmEnd, setConfirmEnd] = useState(null); // championship id awaiting a second click
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState(null);
  const ref = useRef(null);

  function close() {
    setOpen(false);
    setExpanded(null);
    setConfirmEnd(null);
    setEndError(null);
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(championship, page) {
    onSelect({ championship, page });
    close();
  }

  function toggle(c) {
    setConfirmEnd(null);
    setEndError(null);
    setExpanded(expanded === c.id ? null : c.id);
  }

  async function endChampionship(c) {
    setEnding(true);
    setEndError(null);
    try {
      const res = await fetch(`/api/championships/${c.id}/end`, { method: "POST" });
      if (!res.ok) {
        setEndError("Couldn't end the championship. Try again.");
        return;
      }
      close();
      onEnded?.(c);
    } catch {
      setEndError("Can't reach the server.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <nav className="menu" ref={ref}>
      <button
        className="btn ghost small"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? close() : setOpen(true))}
      >
        Championships
        <span className={`chev ${open ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="menu-list">
          {error && <li className="menu-note">Couldn't load championships.</li>}
          {championships?.length === 0 && <li className="menu-note">No active championships.</li>}
          {championships?.map((c) => {
            const isExpanded = expanded === c.id;
            const confirming = confirmEnd === c.id;
            return (
              <li key={c.id}>
                <button
                  className="menu-item menu-parent"
                  aria-expanded={isExpanded}
                  onClick={() => toggle(c)}
                >
                  {c.name}
                  <span className={`chev ${isExpanded ? "open" : ""}`} aria-hidden="true">▾</span>
                </button>
                {isExpanded && (
                  <ul className="submenu">
                    {PAGES.map((p) => (
                      <li key={p}>
                        <button className="menu-item" onClick={() => pick(c, p)}>
                          {p}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        className={`menu-item menu-danger${confirming ? " confirming" : ""}`}
                        disabled={ending}
                        onClick={() => (confirming ? endChampionship(c) : setConfirmEnd(c.id))}
                      >
                        {confirming ? (ending ? "Ending…" : "Click again to end") : "End championship"}
                      </button>
                    </li>
                    {endError && confirming && (
                      <li className="menu-note menu-error">{endError}</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}

          <li className="menu-sep">
            <button
              className="menu-item"
              onClick={() => {
                onSelect({ page: "New Championship" });
                close();
              }}
            >
              New championship
            </button>
          </li>
          <li>
            <button
              className="menu-item"
              onClick={() => {
                onSelect({ page: "History" });
                close();
              }}
            >
              History
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}