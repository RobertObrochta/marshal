import { useEffect, useRef, useState } from "react";

export default function Select({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openList() {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  }

  function choose(opt) {
    onChange(opt);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      setActive((i) =>
        e.key === "ArrowDown" ? Math.min(i + 1, options.length - 1) : Math.max(i - 1, 0)
      );
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // handled here, so the button's own click doesn't fire
      if (open) choose(options[active]);
      else openList();
    }
  }

  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className="dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
      >
        <span>{value}</span>
        <span className={`chev ${open ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="dd-list" role="listbox">
          {options.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={`dd-option${i === active ? " active" : ""}${opt === value ? " selected" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(opt)}
            >
              {opt}
              {opt === value && <span aria-hidden="true">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}