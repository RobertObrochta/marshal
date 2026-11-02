import useApi from "./useApi.js";

export default function DriverStatus({ championship }) {
  const { data: rows, error } = useApi(`/api/championships/${championship.id}/drivers`);

  return (
    <section className="panel">
      <h2>Driver Status</h2>
      <p className="muted">{championship.name}</p>
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.number}</td>
                  <td>{d.points}</td>
                  <td>{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}