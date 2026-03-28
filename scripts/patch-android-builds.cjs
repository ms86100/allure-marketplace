const fs = require('fs');
const path = require('path');

const root = process.cwd();
const verifyOnly = process.argv.includes('--verify');

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

function patchFile(filePath, transform) {
  const current = read(filePath);
  const next = transform(current);
  if (!verifyOnly && next !== current) {
    write(filePath, next);
  }
  return verifyOnly ? current : next;
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
  let next = text;

  if (!next.includes('https://maven.transistorsoft.com')) {
    const originalBlock = `repositories {\n    google()\n    mavenCentral()\n}\n`;
    const replacementBlock = `repositories {\n    google()\n    mavenCentral()\n    maven { url = uri('https://maven.transistorsoft.com') }\n}\n`;
    ensureContains(next, originalBlock, 'Transistorsoft repositories block');
    next = next.replace(originalBlock, replacementBlock);
  }

  next = next.replace("name:'tslocationmanager-v21', version: '3.+'", "name:'tslocationmanager-v21', version: '4.0.21'");
  next = next.replace("name:'tslocationmanager', version: '3.+'", "name:'tslocationmanager', version: '4.0.21'");
  next = next.replace("maven { url 'https://maven.transistorsoft.com' }", "maven { url = uri('https://maven.transistorsoft.com') }");

  return next;
});

for (const filePath of [geolocationGradlePath, calendarGradlePath]) {
  patchFile(filePath, (text) => text.replace('        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"\n', ''));
}

ensureContains(pluginGradle, 'https://maven.transistorsoft.com', 'Transistorsoft Maven repository');

if (!pluginGradle.includes("name:'tslocationmanager-v21', version: '4.0.21'") && !pluginGradle.includes("name:'tslocationmanager', version: '4.0.21'")) {
  throw new Error('Transistorsoft dependency override to 4.0.21 was not applied');
}

for (const filePath of [geolocationGradlePath, calendarGradlePath]) {
  const text = read(filePath);
  if (text.includes('classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"')) {
    throw new Error(`Duplicate Kotlin plugin classpath still present in ${path.relative(root, filePath)}`);
  }
}

console.log(verifyOnly ? 'ANDROID_PLUGIN_PATCH_VERIFY_OK' : 'ANDROID_PLUGIN_PATCH_OK');