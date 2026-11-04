export const STATUS = {
  en_service: { label: 'En service', tone: 'green' },
  en_stock: { label: 'En stock', tone: 'blue' },
  en_reparation: { label: 'En réparation', tone: 'amber' },
  reforme: { label: 'Réformé', tone: 'gray' },
  perdu: { label: 'Perdu', tone: 'red' },
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
};
export const FIELD_LABEL = {
  code: 'Code', label: 'Désignation', category_id: 'Catégorie', brand: 'Marque', model: 'Modèle', serial_number: 'N° de série',
  location_id: 'Localisation', assigned_to: 'Affecté à', status: 'Statut', condition: 'État', purchase_date: "Date d'achat",
  purchase_price: "Prix d'achat", supplier: 'Fournisseur', warranty_end: 'Fin de garantie', notes: 'Notes',
};

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
