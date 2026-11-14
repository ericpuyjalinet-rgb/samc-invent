import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api.js';
import { Empty, Spinner, Stat, useLoad } from '../components/ui.jsx';
import { accountLabel, fmtDate, fmtMoney } from '../labels.js';

const lastDec31 = () => `${new Date().getFullYear() - 1}-12-31`;

export default function Accounting() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, loading, error } = useLoad(() => api(`/accounting/actif?date=${date}`), [date]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>État de l'actif</h1>
          <div className="sub">Inventaire comptable par compte d'imputation, à rapprocher de l'état de l'actif tenu par le comptable public</div>
        </div>
        <div className="right row gap-s">
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto' }} aria-label="Date de l'état" />
          <button className="btn" onClick={() => setDate(lastDec31())}>Au 31/12 dernier</button>
          <button className="btn btn-primary" onClick={() => download(`/accounting/actif.csv?date=${date}`, `etat-de-l-actif-${date}.csv`)}>⇩ Détail par bien (CSV)</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && !data ? <Spinner /> : data && (<>
        <div className="grid grid-4">
          <Stat label="Biens à l'actif" value={data.totals.count} sub={`au ${fmtDate(data.date)}`} />
          <Stat label="Valeur brute" value={fmtMoney(data.totals.gross)} tone="blue" />
          <Stat label="Amortissements cumulés" value={fmtMoney(data.totals.accumulated)} />
          <Stat label="Valeur nette comptable" value={fmtMoney(data.totals.net)} tone="green" />
        </div>

        <div className="card">
          <div className="card-head"><h2>Par compte d'imputation (M57)</h2></div>
          {!data.accounts.length ? <Empty title="Aucun bien à l'actif à cette date" /> : (
            <table>
              <thead><tr><th>Compte</th><th>Biens</th><th>Valeur brute</th><th>Amortissements cumulés</th><th>Valeur nette comptable</th></tr></thead>
              <tbody>{data.accounts.map((a) => (
                <tr key={a.account}>
                  <td>{a.account === 'non renseigné' ? <span className="badge badge-amber">Compte non renseigné</span>
                    : <Link to={`/equipements?account_code=${a.account}`}>{accountLabel(a.account)}</Link>}</td>
                  <td>{a.count}</td><td className="nowrap">{fmtMoney(a.gross)}</td>
                  <td className="nowrap">{fmtMoney(a.accumulated)}</td><td className="nowrap"><strong>{fmtMoney(a.net)}</strong></td>
                </tr>))}
              </tbody>
              <tfoot><tr><td><strong>Total</strong></td><td><strong>{data.totals.count}</strong></td>
                <td className="nowrap"><strong>{fmtMoney(data.totals.gross)}</strong></td><td className="nowrap"><strong>{fmtMoney(data.totals.accumulated)}</strong></td>
                <td className="nowrap"><strong>{fmtMoney(data.totals.net)}</strong></td></tr></tfoot>
            </table>
          )}
        </div>

        <div className="grid grid-2">
          <div className="card card-pad stack">
            <h3>Points de contrôle</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>{data.totals.no_inventory_number ? <><strong>{data.totals.no_inventory_number}</strong> bien(s) sans n° d'inventaire comptable</> : 'Tous les biens ont un n° d\'inventaire'}</li>
              <li>{data.totals.no_value ? <><strong>{data.totals.no_value}</strong> bien(s) sans valeur d'acquisition</> : 'Tous les biens ont une valeur d\'acquisition'}</li>
              <li>{data.accounts.some((a) => a.account === 'non renseigné') ? 'Des biens n\'ont pas de compte : renseignez-le sur leur catégorie' : 'Tous les biens ont un compte d\'imputation'}</li>
            </ul>
          </div>
          <div className="card card-pad stack">
            <h3>Règles appliquées</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Amortissement linéaire au prorata temporis à partir de la date de mise en service (à défaut, d'acquisition), sur la durée de la catégorie.
              Biens de faible valeur (≤ {fmtMoney(data.settings.lowValueThreshold)}) amortis sur un an.
              {data.settings.depreciationEnabled ? '' : ' Amortissement désactivé : valeurs nettes égales aux valeurs brutes.'}
              {' '}Biens loués exclus. Paramètres : <Link to="/parametres">Paramètres</Link>, durées : <Link to="/categories">Catégories</Link>.
            </p>
          </div>
        </div>
      </>)}
    </div>
  );
}
