import { useEffect, useState } from "react";
import ChampionshipsMenu from "./ChampionshipsMenu.jsx";
import Verdicts from "./Verdicts.jsx";
import DriverStatus from "./DriverStatus.jsx";
import NewChampionship from "./NewChampionship.jsx";

const ERRORS = {
  access_denied: "You cancelled the Discord login.",
  invalid_state: "Login session expired. Try again.",
  token_exchange_failed: "Discord rejected the login. Check your client ID, secret and redirect URI.",
};

export default function App() {
  const [status, setStatus] = useState("loading"); // loading | anon | authed | error
  const [user, setUser] = useState(null);
  const [view, setView] = useState(null);
  const [championshipsKey, setChampionshipsKey] = useState(0);
  const [loginError, setLoginError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setLoginError(ERRORS[err] ?? "Login failed. Try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }

    fetch("/api/me")
      .then(async (res) => {
        if (res.ok) {
          setUser(await res.json());
          setStatus("authed");
        } else if (res.status === 401) {
          setStatus("anon");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setView(null);
    setStatus("anon");
  }

  if (status === "loading") return <main className="screen" aria-busy="true" />;

  if (status === "error") {
    return (
      <main className="screen">
        <p className="error">Can't reach the server. Make sure it's running, then reload.</p>
      </main>
    );
  }

  if (status === "anon") {
    return (
      <main className="screen">
        <h1>Sign in</h1>
        <p className="muted">Log in with Discord to continue.</p>
        {loginError && <p className="error" role="alert">{loginError}</p>}
        {/* Full page navigation, not fetch: the server redirects to Discord */}
        <a className="btn" href="/api/auth/login">Log in with Discord</a>
      </main>
    );
  }
  
 return (
  <main className="screen">
    <ChampionshipsMenu onSelect={setView} reloadKey={championshipsKey} />
      {view?.page === "New Championship" && (
        <NewChampionship onCreated={() => setChampionshipsKey((k) => k + 1)} />
      )}
    {view?.page === "Verdicts" && <Verdicts championship={view.championship} />}
    {view?.page === "Driver Status" && <DriverStatus championship={view.championship} />}
    {!view && <h1 className="hello">Hello World</h1>}
    <div className="who">
      {user.avatar && <img src={user.avatar} alt="" width="32" height="32" />}
      <span>Signed in as {user.displayName}</span>
      <button className="btn ghost small" onClick={logout}>Log out</button>
    </div>
  </main>
);
}
