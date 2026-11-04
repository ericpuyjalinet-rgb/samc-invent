import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrImg({ value, size = 220, ...rest }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(String(value), { margin: 1, width: size, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [value, size]);
  return src ? <img src={src} alt={`QR ${value}`} {...rest} /> : null;
}
