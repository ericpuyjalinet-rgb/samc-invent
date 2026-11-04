// Lance le serveur avec les bonnes options selon la version de Node.js (compatible Windows / macOS / Linux)
const { spawn } = require('node:child_process');
const path = require('node:path');
const [major, minor] = process.versions.node.split('.').map(Number);
const script = process.argv[2] || 'src/index.js';
const flags = ['--no-warnings'];
if (major === 22 && minor >= 5 && minor < 13) flags.push('--experimental-sqlite');
if (process.argv.includes('--watch')) flags.push('--watch');
const child = spawn(process.execPath, [...flags, path.join(__dirname, script)], { stdio: 'inherit', cwd: __dirname });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
