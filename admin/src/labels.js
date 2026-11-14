export const STATUS = {
  en_service: { label: 'En service', tone: 'green' },
  en_stock: { label: 'En stock', tone: 'blue' },
  en_reparation: { label: 'En réparation', tone: 'amber' },
  reforme: { label: 'Réformé', tone: 'gray' },
  perdu: { label: 'Perdu', tone: 'red' },
  sorti: { label: "Sorti de l'inventaire", tone: 'gray' },
};
export const CONDITION = {
  neuf: { label: 'Neuf', tone: 'green' },
  bon: { label: 'Bon', tone: 'green' },
  moyen: { label: 'Moyen', tone: 'amber' },
  mauvais: { label: 'Mauvais', tone: 'red' },
  hs: { label: 'Hors service', tone: 'red' },
};
export const FAMILY = {
  informatique: { label: 'Informatique', tone: 'blue' },
  mobilier: { label: 'Mobilier', tone: 'violet' },
  autre: { label: 'Autre', tone: 'gray' },
};
export const CAMPAIGN_STATUS = {
  brouillon: { label: 'Brouillon', tone: 'gray' },
  en_cours: { label: 'En cours', tone: 'blue' },
  cloturee: { label: 'Clôturée', tone: 'green' },
};
export const ROLE = {
  admin: { label: 'Administrateur', tone: 'violet' },
  gestionnaire: { label: 'Gestionnaire', tone: 'blue' },
  agent: { label: "Agent d'inventaire", tone: 'gray' },
};
export const ACTION = {
  creation: 'Création', modification: 'Modification', deplacement: 'Déplacement', photo: 'Photo ajoutée',
  import_creation: 'Création (import)', import_maj: 'Mise à jour (import)', inventaire_deplacement: 'Déplacement (inventaire)',
  inventaire_etat: 'État mis à jour (inventaire)', inventaire_manquant: 'Déclaré manquant (inventaire)',
  sortie_proposee: 'Proposé à la sortie', sortie_validee: "Sorti de l'inventaire", sortie_annulee: 'Proposition de sortie annulée',
};
export const FIELD_LABEL = {
  code: 'Code', label: 'Désignation', category_id: 'Catégorie', brand: 'Marque', model: 'Modèle', serial_number: 'N° de série',
  location_id: 'Localisation', assigned_to: 'Affecté à', status: 'Statut', condition: 'État', purchase_date: "Date d'achat",
  purchase_price: "Prix d'achat", supplier: 'Fournisseur', warranty_end: 'Fin de garantie', notes: 'Notes',
  service_id: 'Service', inventory_number: "N° d'inventaire", account_code: 'Compte', acquisition_mode: "Mode d'acquisition",
  fiscal_year: 'Exercice', mandate_number: 'N° de mandat', invoice_number: 'N° de facture', contract_number: 'Marché',
  depreciation_years: "Durée d'amortissement", commissioning_date: 'Mise en service', motif: 'Motif', decision: 'Décision',
};

export const ACQUISITION_MODE = {
  achat: 'Achat', don: 'Don', transfert: 'Transfert (autre collectivité)', mise_a_disposition: 'Mise à disposition',
  location: 'Location / crédit-bail', autre: 'Autre',
};
export const DISPOSAL_REASON = {
  obsolescence: 'Obsolescence', panne: 'Panne / hors d\'usage', vol: 'Vol', perte: 'Perte', destruction: 'Destruction',
  cession: 'Cession (vente)', don: 'Don (association, école…)', transfert: 'Transfert à une autre collectivité', autre: 'Autre',
};
export const DECISION_TYPE = {
  certificat_administratif: 'Certificat administratif', decision: 'Décision du maire / président', deliberation: 'Délibération',
};
export const DISPOSAL_STATUS = {
  proposee: { label: 'Proposée', tone: 'amber' },
  validee: { label: 'Validée', tone: 'green' },
  annulee: { label: 'Annulée', tone: 'gray' },
};
/** Comptes d'immobilisations M57 les plus courants pour un inventaire de mobilier et de matériel. */
export const M57_ACCOUNTS = {
  2051: 'Concessions et droits similaires (logiciels)',
  2158: 'Autres installations, matériel et outillage techniques',
  2182: 'Matériel de transport',
  2183: 'Matériel de bureau et matériel informatique',
  2184: 'Mobilier',
  2188: 'Autres immobilisations corporelles',
};
export const accountLabel = (c) => (c ? `${c}${M57_ACCOUNTS[c] ? ` — ${M57_ACCOUNTS[c]}` : ''}` : '—');

export const fmtDate = (d) => (d ? new Date(d.length <= 10 ? `${d}T00:00:00` : d.replace(' ', 'T') + (d.includes('Z') || d.includes('T') ? '' : 'Z')).toLocaleDateString('fr-FR') : '—');
export const fmtDateTime = (d) => {
  if (!d) return '—';
  const iso = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};
export const fmtMoney = (n) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }));
export const locLabel = (x) => x && (x.location_name || x.name)
  ? [x.site_name, x.building && `Bât. ${x.building}`, x.floor && `Ét. ${x.floor}`, x.location_name || x.name].filter(Boolean).join(' › ')
  : 'Non localisé';

/** URL d'une photo : absolue (Supabase Storage) ou fichier local servi sous /uploads/. */
export const photoUrl = (p) => (!p ? null : /^https?:\/\//.test(p) ? p : `/uploads/${p}`);
