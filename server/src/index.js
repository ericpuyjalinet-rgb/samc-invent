// Point d'entrée du serveur SAMC Invent
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`\n[SAMC Invent] Node.js ${process.versions.node} détecté : la version 20 ou supérieure est requise.`);
  console.error('Téléchargez la version LTS sur https://nodejs.org puis relancez « npm start ».\n');
  process.exit(1);
}

let app;
try {
  let init;
  ({ app, init } = await import('./app.js'));
  await init;
} catch (e) {
  console.error('\n[SAMC Invent] Impossible de démarrer :', e?.message || e);
  if (String(e?.message).includes('libsql')) console.error('Relancez « npm install » (module de base de données manquant).\n');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  console.log(`[SAMC Invent] Serveur démarré sur http://localhost:${PORT}`);
  console.log(`  • Administration : http://localhost:${PORT}/`);
  console.log(`  • Application mobile (PWA) : http://localhost:${PORT}/mobile/`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[SAMC Invent] Le port ${PORT} est déjà utilisé. Fermez l'autre application ou choisissez un autre port (variable PORT).\n`);
  } else console.error(e);
  process.exit(1);
});
