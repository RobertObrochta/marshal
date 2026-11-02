import { useState } from "react";

// A text input with a styled suggestion list. Typing anything is allowed;
// the list is only a shortcut. Items in `pinned` are always offered at the
// top, whatever has been typed.
export default function Combobox({ value, onChange, options, pinned = [], ...inputProps }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim().toLowerCase();
  const isExact = (o) => o.toLowerCase() === query;

  const pinnedMatches = pinned.filter((o) => !isExact(o));
  const others = options
    .filter((o) => !pinned.includes(o) && o.toLowerCase().includes(query) && !isExact(o))
    .slice(0, 8);
  const matches = [...pinnedMatches, ...others];
  const showList = open && matches.length > 0;

  function pick(opt) {
    onChange(opt);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && showList && active >= 0) {
      e.preventDefault(); // pick the suggestion instead of submitting the form
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="dd">
      <input
        {...inputProps}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="dd-list" role="listbox">
          {matches.map((opt, i) => {
            const isPinned = i < pinnedMatches.length;
            const lastPinned = isPinned && i === pinnedMatches.length - 1 && others.length > 0;
            return (
              <li
                key={opt}
                role="option"
                aria-selected={i === active}
                className={
                  "dd-option" +
                  (i === active ? " active" : "") +
                  (isPinned ? " pinned" : "") +
                  (lastPinned ? " pinned-last" : "")
                }
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  pick(opt);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {opt}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}