import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Lecteur QR / codes-barres via la caméra arrière.
 * onDetect(code) est appelé à chaque nouveau code (anti-rebond de 2,5 s sur un même code).
 */
export default function Scanner({ onDetect, paused, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const last = useRef({ code: null, at: 0 });
  const pausedRef = useRef(paused);
  const cbRef = useRef(onDetect);
  const [error, setError] = useState('');
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  pausedRef.current = paused;
  cbRef.current = onDetect;

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("La caméra n'est pas accessible. L'application doit être ouverte en HTTPS (ou sur localhost).");
      return undefined;
    }
    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      videoRef.current,
      (result) => {
        if (!result || pausedRef.current) return;
        const code = result.getText().trim();
        const now = Date.now();
        if (code === last.current.code && now - last.current.at < 2500) return;
        last.current = { code, at: now };
        cbRef.current(code);
      },
    ).then((controls) => {
      if (cancelled) { controls.stop(); return; }
      controlsRef.current = controls;
      setTorchAvailable(typeof controls.switchTorch === 'function');
    }).catch((e) => {
      setError(e?.name === 'NotAllowedError'
        ? "Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur, ou saisissez le code manuellement."
        : `Caméra indisponible (${e?.message || e}).`);
    });
    return () => { cancelled = true; controlsRef.current?.stop(); };
  }, []);

  const toggleTorch = async () => {
    try { await controlsRef.current?.switchTorch?.(!torch); setTorch(!torch); } catch { setTorchAvailable(false); }
  };

  return (
    <div className="scanner">
      <video ref={videoRef} muted playsInline />
      <div className={`scanner-frame ${paused ? 'is-paused' : ''}`}><span /></div>
      {error && <div className="scanner-error">{error}</div>}
      <div className="scanner-tools">
        {torchAvailable && <button className="round-btn" onClick={toggleTorch} aria-label="Lampe">{torch ? '🔦' : '💡'}</button>}
        {onClose && <button className="round-btn" onClick={onClose} aria-label="Fermer la caméra">✕</button>}
      </div>
      {!error && <div className="scanner-hint">{paused ? 'En pause' : 'Visez le QR code ou le code-barres'}</div>}
    </div>
  );
}
