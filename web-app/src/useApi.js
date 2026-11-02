import { useEffect, useState } from "react";

export default function useApi(url, reloadKey = 0) {
  const [state, setState] = useState({ data: null, error: false });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: false });
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => !cancelled && setState({ data, error: false }))
      .catch(() => !cancelled && setState({ data: null, error: true }));
    return () => { cancelled = true; };
  }, [url, reloadKey]);

  return state;
}