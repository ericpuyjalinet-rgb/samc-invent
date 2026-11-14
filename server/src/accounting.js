/**
 * Calculs comptables (instruction budgétaire et comptable M57).
 *
 * Amortissement linéaire au prorata temporis : la dotation court à partir de la date de mise en
 * service (à défaut la date d'achat), au jour près, sur la durée fixée par délibération pour la
 * catégorie (ou surchargée sur le bien). Les biens de faible valeur (prix ≤ seuil délibéré)
 * s'amortissent sur un an.
 */
import { db, getSetting } from './db.js';

export const ACQUISITION_MODES = ['achat', 'don', 'transfert', 'mise_a_disposition', 'location', 'autre'];
export const DISPOSAL_REASONS = ['obsolescence', 'panne', 'vol', 'perte', 'destruction', 'cession', 'don', 'transfert', 'autre'];
export const DECISION_TYPES = ['certificat_administratif', 'decision', 'deliberation'];

/** Paramètres comptables de la collectivité. */
export async function accountingSettings(x = db) {
  return {
    lowValueThreshold: Number(await getSetting('low_value_threshold', '500', x)) || 0,
    depreciationEnabled: (await getSetting('depreciation_enabled', '1', x)) === '1',
  };
}

const DAY = 86400000;
const toDate = (d) => (d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T00:00:00Z`));
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Amortissement d'un bien à une date donnée.
 * asset : { purchase_price, purchase_date, commissioning_date, depreciation_years, category_depreciation_years, acquisition_mode, status }
 */
export function depreciation(asset, settings, at = new Date()) {
  const gross = Number(asset.purchase_price) || 0;
  const start = asset.commissioning_date || asset.purchase_date;
  const lowValue = gross > 0 && settings.lowValueThreshold > 0 && gross <= settings.lowValueThreshold;
  let years = Number(asset.depreciation_years || asset.category_depreciation_years) || null;
  if (lowValue) years = 1;
  const base = { gross_value: round2(gross), years, low_value: lowValue, start_date: start || null };
  // Non amortissable : amortissement désactivé, valeur nulle, durée ou date inconnue, bien loué
  if (!settings.depreciationEnabled || !gross || !years || !start || asset.acquisition_mode === 'location') {
    return { ...base, depreciable: false, annual: 0, accumulated: 0, net_book_value: round2(gross), fully_depreciated: false };
  }
  const annual = gross / years;
  const elapsedYears = Math.max(0, (toDate(at) - toDate(start)) / DAY / 365);
  const accumulated = Math.min(gross, annual * elapsedYears);
  const end = new Date(toDate(start).getTime() + years * 365 * DAY);
  return {
    ...base,
    depreciable: true,
    annual: round2(annual),
    accumulated: round2(accumulated),
    net_book_value: round2(gross - accumulated),
    end_date: end.toISOString().slice(0, 10),
    fully_depreciated: accumulated >= gross,
  };
}

/** Compte d'imputation effectif : celui du bien, sinon celui de sa catégorie. */
export const accountOf = (a) => a.account_code || a.category_account_code || null;
