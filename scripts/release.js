const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function releaseVersion(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('.') + '.' + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('');
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content);
}

function updateVersionModule(version) {
  const file = 'app-version.js';
  const source = read(file);
  if (!/const APP_VERSION = '[^']+';/.test(source)) {
    throw new Error(`${file} does not contain an APP_VERSION assignment.`);
  }
  const next = source.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${version}';`);
  write(file, next);
}

function updateVersionJson(version) {
  write('version.json', `${JSON.stringify({ version }, null, 2)}\n`);
}

function updateIndexAssetVersions(version) {
  const file = 'index.html';
  const source = read(file);
  if (!/(?:href|src)="(?!https?:\/\/)[^"]+\.(?:css|js)\?v=[^"]+"/.test(source)) {
    throw new Error(`${file} did not contain any versioned CSS/JS assets.`);
  }
  const next = source.replace(
    /((?:href|src)="(?!https?:\/\/)[^"]+\.(?:css|js)\?v=)[^"]+(")/g,
    `$1${version}$2`
  );
  write(file, next);
}

function main() {
  const versionArg = process.argv.find(arg => arg.startsWith('--version='));
  const version = versionArg ? versionArg.slice('--version='.length).trim() : releaseVersion();
  if (!/^\d{4}\.\d{2}\.\d{2}\.\d{6}$/.test(version)) {
    throw new Error(`Invalid release version "${version}". Expected YYYY.MM.DD.HHMMSS.`);
  }

  updateVersionModule(version);
  updateVersionJson(version);
  updateIndexAssetVersions(version);

  execFileSync(process.execPath, [path.join(root, 'scripts/validate-release.js')], {
    cwd: root,
    stdio: 'inherit'
  });

  console.log(`Release ${version} is ready.`);
}

main();
