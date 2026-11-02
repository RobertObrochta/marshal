import { useEffect, useRef, useState } from "react";
import useApi from "./useApi.js";

const PAGES = ["Verdicts", "Driver Status"];

export default function ChampionshipsMenu({ onSelect, reloadKey }) {
  const { data: championships, error } = useApi("/api/championships", reloadKey);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null); // championship id
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
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
    setOpen(false);
    setExpanded(null);
  }

  return (
    <nav className="menu" ref={ref}>
      <button
        className="btn ghost small"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        Championships
        <span className={`chev ${open ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="menu-list">
          {error && <li className="menu-note">Couldn't load championships.</li>}
          {championships?.length === 0 && <li className="menu-note">No championships yet.</li>}
          {championships?.map((c) => {
            const isExpanded = expanded === c.id;
            return (
              <li key={c.id}>
                <button
                  className="menu-item menu-parent"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : c.id)}
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
                setOpen(false);
                setExpanded(null);
              }}
            >
              New championship
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}