// Point d'entrée du serveur SAMC Invent
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`\n[SAMC Invent] Node.js ${process.versions.node} détecté : la version 22.5 ou supérieure est requise.`);
  console.error('Téléchargez la version LTS sur https://nodejs.org puis relancez « npm start ».\n');
  process.exit(1);
}

let app;
try {
  ({ app } = await import('./app.js'));
} catch (e) {
  if (e?.code === 'ERR_UNKNOWN_BUILTIN_MODULE' || String(e?.message).includes('node:sqlite')) {
    console.error(`\n[SAMC Invent] Le module SQLite intégré n'est pas disponible avec Node.js ${process.versions.node}.`);
    console.error('Installez Node.js 22.13+ (LTS) depuis https://nodejs.org, ou lancez : node --experimental-sqlite src/index.js\n');
    process.exit(1);
  }
  throw e;
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
