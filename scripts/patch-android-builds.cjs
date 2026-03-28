const fs = require('fs');
const path = require('path');

const root = process.cwd();
const verifyOnly = process.argv.includes('--verify');

function getBundledTransistorsoftVersion(moduleName) {
  const metadataPath = path.join(
    root,
    'node_modules',
    '@transistorsoft',
    'capacitor-background-geolocation',
    'android',
    'libs',
    'com',
    'transistorsoft',
    moduleName,
    'maven-metadata.xml',
  );

  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Bundled Transistorsoft metadata not found: ${path.relative(root, metadataPath)}`);
  }

  const metadata = read(metadataPath);
  const releaseMatch = metadata.match(/<release>([^<]+)<\/release>/);
  const latestMatch = metadata.match(/<latest>([^<]+)<\/latest>/);
  const version = releaseMatch?.[1] ?? latestMatch?.[1];

  if (!version) {
    throw new Error(`Unable to determine bundled version for ${moduleName}`);
  }

  return version;
}

const bundledTsLocationManagerVersion = getBundledTransistorsoftVersion('tslocationmanager');
const bundledTsLocationManagerV21Version = getBundledTransistorsoftVersion('tslocationmanager-v21');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content);
}

function ensureContains(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Missing expected snippet for ${label}`);
  }
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

function patchRepositoryBlock(block) {
  const lines = block.split('\n');
  if (lines.length < 2) {
    return block;
  }

  const closingLine = lines[lines.length - 1];
  const existingEntryLine = lines.slice(1, -1).find((line) => line.trim().length > 0);
  const entryIndent = existingEntryLine?.match(/^\s*/)?.[0] ?? `${closingLine.match(/^\s*/)?.[0] ?? ''}    `;
  const hasTransistorsoftReference = lines.some((line) => /maven\.transistorsoft\.com|['"]\.\/libs['"]/.test(line));

  if (!hasTransistorsoftReference) {
    return block;
  }

  let hasLocalRepo = false;
  let hasRemoteRepo = false;
  const nextLines = [lines[0]];

  for (const line of lines.slice(1, -1)) {
    if (/['"]\.\/libs['"]/.test(line)) {
      if (!hasLocalRepo) {
        nextLines.push(`${entryIndent}maven { url = uri('./libs') }`);
        hasLocalRepo = true;
      }
      continue;
    }

    if (/maven\.transistorsoft\.com/.test(line)) {
      if (!hasLocalRepo) {
        nextLines.push(`${entryIndent}maven { url = uri('./libs') }`);
        hasLocalRepo = true;
      }
      if (!hasRemoteRepo) {
        nextLines.push(`${entryIndent}maven { url = uri('https://maven.transistorsoft.com') }`);
        hasRemoteRepo = true;
      }
      continue;
    }

    nextLines.push(line);
  }

  nextLines.push(closingLine);
  return nextLines.join('\n');
}

function patchTransistorsoftRepositoryBlocks(text) {
  return text.replace(/repositories\s*\{[\s\S]*?\n\s*\}/g, (block) => patchRepositoryBlock(block));
}

function patchFile(filePath, transform) {
  const current = read(filePath);
  const next = transform(current);
  if (verifyOnly) {
    if (next !== current) {
      throw new Error(`Patch not applied for ${path.relative(root, filePath)}`);
    }
    return current;
  }

  if (next !== current) {
    write(filePath, next);
  }

  return next;
}

const pluginGradlePath = path.join(root, 'node_modules', '@transistorsoft', 'capacitor-background-geolocation', 'android', 'build.gradle');
const geolocationGradlePath = path.join(root, 'node_modules', '@capacitor', 'geolocation', 'android', 'build.gradle');
const calendarGradlePath = path.join(root, 'node_modules', '@ebarooni', 'capacitor-calendar', 'android', 'build.gradle');

for (const filePath of [pluginGradlePath, geolocationGradlePath, calendarGradlePath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required Android plugin file not found: ${path.relative(root, filePath)}`);
  }
}

const pluginGradle = patchFile(pluginGradlePath, (text) => {
  let next = normalizeLineEndings(text);

  next = patchTransistorsoftRepositoryBlocks(next);

  next = next.replace(/name:'tslocationmanager-v21', version: '\d+\.\d+\.\d+'|name:'tslocationmanager-v21', version: '3\.\+'|name:'tslocationmanager-v21', version: '\+'/g, `name:'tslocationmanager-v21', version: '${bundledTsLocationManagerV21Version}'`);
  next = next.replace(/name:'tslocationmanager', version: '\d+\.\d+\.\d+'|name:'tslocationmanager', version: '3\.\+'|name:'tslocationmanager', version: '\+'/g, `name:'tslocationmanager', version: '${bundledTsLocationManagerVersion}'`);
  next = next.replace("maven { url 'https://maven.transistorsoft.com' }", "maven { url = uri('https://maven.transistorsoft.com') }");

  return next;
});

for (const filePath of [geolocationGradlePath, calendarGradlePath]) {
  patchFile(filePath, (text) => text.replace('        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"\n', ''));
}

ensureContains(pluginGradle, "maven { url = uri('./libs') }", 'Transistorsoft local Maven repository');

if (!pluginGradle.includes(`name:'tslocationmanager-v21', version: '${bundledTsLocationManagerV21Version}'`) || !pluginGradle.includes(`name:'tslocationmanager', version: '${bundledTsLocationManagerVersion}'`)) {
  throw new Error('Transistorsoft dependency alignment to bundled local artifacts was not applied');
}

for (const filePath of [geolocationGradlePath, calendarGradlePath]) {
  const text = read(filePath);
  if (text.includes('classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"')) {
    throw new Error(`Duplicate Kotlin plugin classpath still present in ${path.relative(root, filePath)}`);
  }
}

console.log(verifyOnly ? 'ANDROID_PLUGIN_PATCH_VERIFY_OK' : 'ANDROID_PLUGIN_PATCH_OK');