// Lance un script du serveur (compatible Windows / macOS / Linux).
// Charge automatiquement le fichier .env à la racine du projet s'il existe.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const script = process.argv[2] || 'src/index.js';
const flags = ['--no-warnings'];
for (const f of [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')]) {
  if (fs.existsSync(f)) { flags.push(`--env-file=${f}`); break; }
}
if (process.argv.includes('--watch')) flags.push('--watch');
const child = spawn(process.execPath, [...flags, path.join(__dirname, script)], { stdio: 'inherit', cwd: __dirname });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
