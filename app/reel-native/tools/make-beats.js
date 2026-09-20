/**
 * Telifsiz ritim döngülerini WAV olarak üretir.
 * Referans tempo 100 BPM; uygulama playbackRate ile hedef tempoya çeker.
 *   node tools/make-beats.js
 */
const fs = require('fs');
const path = require('path');

const SR = 22050;
const BPM = 100;
const SPB = 60 / BPM;
const BEATS = 16;              // 4 bar
const DUR = BEATS * SPB;       // 9.6 sn
const N = Math.round(DUR * SR);

function mkBuf() { return new Float32Array(N); }
const at = (t) => Math.round(t * SR);

function kick(buf, t, peak = 0.95) {
  const start = at(t), len = at(0.34);
  for (let i = 0; i < len && start + i < N; i++) {
    const s = i / SR;
    const f = 140 * Math.exp(-s * 24) + 42;
    const env = Math.exp(-s * 11);
    buf[start + i] += Math.sin(2 * Math.PI * f * s) * env * peak;
  }
}
function noise(buf, t, len, peak, type, freq) {
  const start = at(t), n = at(len);
  // tek kutuplu filtre katsayısı
  const rc = 1 / (2 * Math.PI * freq);
  const dt = 1 / SR;
  const a = type === 'lowpass' ? dt / (rc + dt) : rc / (rc + dt);
  let prevIn = 0, prevOut = 0;
  for (let i = 0; i < n && start + i < N; i++) {
    const x = Math.random() * 2 - 1;
    let y;
    if (type === 'lowpass') { y = prevOut + a * (x - prevOut); }
    else { y = a * (prevOut + x - prevIn); }
    prevIn = x; prevOut = y;
    const env = Math.exp(-(i / SR) * (3 / Math.max(0.02, len)));
    buf[start + i] += y * env * peak;
  }
}
function tone(buf, t, len, freq, peak, type) {
  const start = at(t), n = at(len);
  for (let i = 0; i < n && start + i < N; i++) {
    const s = i / SR;
    const ph = 2 * Math.PI * freq * s;
    let v;
    if (type === 'saw') v = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
    else if (type === 'tri') v = 2 * Math.abs(2 * ((ph / (2 * Math.PI)) % 1) - 1) - 1;
    else v = Math.sin(ph);
    const env = Math.min(1, s / 0.012) * Math.exp(-s * (2.2 / Math.max(0.1, len)));
    buf[start + i] += v * env * peak;
  }
}
function pad(buf, t, len, freqs, peak) {
  const start = at(t), n = at(len);
  for (let i = 0; i < n && start + i < N; i++) {
    const s = i / SR;
    const env = Math.min(1, s / (len * 0.35)) * Math.min(1, (len - s) / (len * 0.45));
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * s);
    buf[start + i] += (v / freqs.length) * env * peak;
  }
}

const ROOT = [110, 130.81, 146.83, 98];
const B = (n) => n * SPB;

const STYLES = {
  house(buf) {
    for (let b = 0; b < BEATS; b++) {
      kick(buf, B(b), 1.0);
      noise(buf, B(b) + SPB * 0.5, 0.045, 0.22, 'highpass', 8000);
      if (b % 4 === 2) noise(buf, B(b), 0.14, 0.4, 'highpass', 1800);
      tone(buf, B(b) + SPB * 0.5, SPB * 0.4, ROOT[Math.floor(b / 4) % 4], 0.2, 'saw');
    }
  },
  trap(buf) {
    [0, 1.75, 4, 6.5, 8, 9.75, 12, 14.5].forEach((k) => kick(buf, B(k), 1.0));
    [2, 6, 10, 14].forEach((s) => noise(buf, B(s), 0.16, 0.45, 'highpass', 1700));
    for (let b = 0; b < BEATS; b++) {
      noise(buf, B(b), 0.035, 0.16, 'highpass', 9000);
      noise(buf, B(b) + SPB * 0.5, 0.03, 0.13, 'highpass', 9000);
      if (b % 4 === 3) for (let r = 0; r < 4; r++) noise(buf, B(b) + SPB * 0.25 * r, 0.022, 0.12, 'highpass', 10000);
      if (b % 4 === 0) tone(buf, B(b), SPB * 1.6, ROOT[Math.floor(b / 4) % 4] / 2, 0.3, 'sine');
    }
  },
  pop(buf) {
    for (let b = 0; b < BEATS; b++) {
      if (b % 4 === 0 || b % 4 === 2) kick(buf, B(b), 0.9);
      if (b % 4 === 1 || b % 4 === 3) noise(buf, B(b), 0.13, 0.4, 'highpass', 1900);
      noise(buf, B(b) + SPB * 0.5, 0.04, 0.17, 'highpass', 8500);
      if (b % 4 === 0) {
        const r = ROOT[Math.floor(b / 4) % 4];
        pad(buf, B(b), SPB * 3.6, [r, r * 1.25, r * 1.5], 0.1);
        tone(buf, B(b), SPB * 0.9, r / 2, 0.26, 'sine');
      }
    }
  },
  lofi(buf) {
    [0, 2.75, 4, 8, 10.75, 12].forEach((k) => kick(buf, B(k), 0.8));
    [2, 6, 10, 14].forEach((s) => noise(buf, B(s), 0.2, 0.3, 'highpass', 1300));
    for (let b = 0; b < BEATS; b++) {
      noise(buf, B(b), 0.05, 0.1, 'highpass', 6500);
      noise(buf, B(b) + SPB * 0.66, 0.04, 0.07, 'highpass', 6500);
      if (b % 4 === 0) {
        const r = ROOT[Math.floor(b / 4) % 4];
        pad(buf, B(b), SPB * 3.8, [r, r * 1.19, r * 1.5, r * 1.78], 0.085);
      }
    }
    noise(buf, 0, DUR, 0.015, 'highpass', 3000);
  },
  cine(buf) {
    for (let bar = 0; bar < 4; bar++) {
      const r = ROOT[bar % 4];
      pad(buf, B(bar * 4), SPB * 4.4, [r / 2, r, r * 1.5, r * 2], 0.16);
      kick(buf, B(bar * 4), 0.55);
      if (bar % 2 === 1) noise(buf, B(bar * 4 + 3.5), 0.5, 0.16, 'highpass', 2500);
    }
  },
};

function writeWav(file, buf) {
  // tepe normalizasyonu + yumuşak sınırlama
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const g = peak > 0 ? 0.89 / peak : 1;
  const pcm = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) {
    let v = Math.tanh(buf[i] * g * 1.05);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);      // PCM
  header.writeUInt16LE(1, 22);      // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}

const outDir = path.join(__dirname, '..', 'assets', 'beats');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, fn] of Object.entries(STYLES)) {
  const buf = mkBuf();
  fn(buf);
  const file = path.join(outDir, name + '.wav');
  writeWav(file, buf);
  console.log(name, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
}
console.log('referans tempo:', BPM, 'BPM · süre:', DUR.toFixed(2), 'sn');
