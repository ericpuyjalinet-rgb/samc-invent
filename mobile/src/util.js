export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export const CONDITIONS = [
  { key: 'neuf', label: 'Neuf' }, { key: 'bon', label: 'Bon' }, { key: 'moyen', label: 'Moyen' },
  { key: 'mauvais', label: 'Mauvais' }, { key: 'hs', label: 'HS' },
];
export const conditionLabel = (k) => CONDITIONS.find((c) => c.key === k)?.label || '—';

export const roomLabel = (l) => (l ? [l.building && `Bât. ${l.building}`, l.floor && `Ét. ${l.floor}`, l.name].filter(Boolean).join(' › ') : '—');
export const fullRoomLabel = (l) => (l ? `${l.site_name} › ${roomLabel(l)}` : 'Non localisé');

export const fmtTime = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Redimensionne et compresse une photo pour limiter le volume hors-ligne. */
export function compressImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function feedback(kind = 'ok') {
  try { navigator.vibrate?.(kind === 'ok' ? 60 : [80, 60, 80]); } catch { /* */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = kind === 'ok' ? 1100 : kind === 'warn' ? 620 : 300;
    g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (kind === 'ok' ? 0.09 : 0.22));
    o.onended = () => ctx.close();
  } catch { /* */ }
}
