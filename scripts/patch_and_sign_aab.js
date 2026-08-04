const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function alignElf16k(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer[0] !== 0x7f || buffer[1] !== 0x45 || buffer[2] !== 0x4c || buffer[3] !== 0x46) return false;
  if (buffer[4] !== 2) return false; // 64-bit ELF
  
  const e_phoff = Number(buffer.readBigUInt64LE(32));
  const e_phentsize = buffer.readUInt16LE(54);
  const e_phnum = buffer.readUInt16LE(56);
  
  let modified = false;
  for (let i = 0; i < e_phnum; i++) {
    const offset = e_phoff + (i * e_phentsize);
    const p_type = buffer.readUInt32LE(offset);
    if (p_type === 1) { // PT_LOAD
      const p_align = Number(buffer.readBigUInt64LE(offset + 48));
      if (p_align < 16384) {
        buffer.writeBigUInt64LE(BigInt(16384), offset + 48);
        modified = true;
      }
    }
  }
  if (modified) {
    fs.writeFileSync(filePath, buffer);
  }
  return modified;
}

function processAab(inputAabPath, outputAabPath) {
  const workDir = path.resolve('./tmp_aab_patch');
  if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir);

  const tempZip = path.resolve('./tmp_aab_patch_file.zip');
  const tempOutputZip = path.resolve('./tmp_aab_out_file.zip');
  if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
  if (fs.existsSync(tempOutputZip)) fs.unlinkSync(tempOutputZip);

  fs.copyFileSync(inputAabPath, tempZip);

  console.log(`Unpacking ${inputAabPath}...`);
  execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${workDir}' -Force"`);

  const libDirs = [
    path.join(workDir, 'base/lib/arm64-v8a'),
    path.join(workDir, 'base/lib/x86_64')
  ];

  let patchedCount = 0;
  libDirs.forEach(libDir => {
    if (fs.existsSync(libDir)) {
      const files = fs.readdirSync(libDir).filter(f => f.endsWith('.so'));
      files.forEach(f => {
        if (alignElf16k(path.join(libDir, f))) {
          patchedCount++;
        }
      });
    }
  });

  console.log(`Patched 16KB alignment in ${patchedCount} shared libraries.`);

  const metaInf = path.join(workDir, 'META-INF');
  if (fs.existsSync(metaInf)) {
    const sigFiles = fs.readdirSync(metaInf).filter(f => f.endsWith('.SF') || f.endsWith('.RSA') || f.endsWith('.DSA') || f === 'MANIFEST.MF');
    sigFiles.forEach(f => {
      try { fs.unlinkSync(path.join(metaInf, f)); } catch (e) {}
    });
  }

  if (fs.existsSync(outputAabPath)) fs.unlinkSync(outputAabPath);
  console.log(`Repackaging to ${outputAabPath}...`);
  execSync(`powershell -Command "Compress-Archive -Path '${workDir}\\*' -DestinationPath '${tempOutputZip}' -Force"`);
  fs.copyFileSync(tempOutputZip, outputAabPath);

  console.log(`Signing AAB with release keystore...`);
  const keystorePath = path.resolve('android/app/pinc-release.jks');
  const storePass = '63d845d200905ae21e0f7f79d069a57b';
  const keyAlias = '8868f87a95651653d374c9a2f6a9e9d1';
  const keyPass = '61237d807934f76c25a09ca67e4c8f2b';

  const signCmd = `jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${keystorePath}" -storepass "${storePass}" -keypass "${keyPass}" "${outputAabPath}" ${keyAlias}`;
  execSync(signCmd);

  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.unlinkSync(tempZip); } catch (e) {}
  try { fs.unlinkSync(tempOutputZip); } catch (e) {}
  console.log(`✨ Successfully created 16KB aligned & signed AAB: ${outputAabPath}`);
}

const args = process.argv.slice(2);
const inputAab = args[0] || 'android/app/build/outputs/bundle/release/app-release.aab';

let defaultOutputAab = 'pinc-production-v1.1.8-240.aab';
try {
  const gradleContent = fs.readFileSync('android/app/build.gradle', 'utf8');
  const vCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);
  const vNameMatch = gradleContent.match(/versionName\s+"([^"]+)"/);
  if (vCodeMatch && vNameMatch) {
    defaultOutputAab = `pinc-production-v${vNameMatch[1]}-${vCodeMatch[1]}.aab`;
  }
} catch (e) {}

const outputAab = args[1] || defaultOutputAab;

processAab(inputAab, outputAab);
