import type { Clip, Doc, Ratio } from './types';

/**
 * Geçiş matematiği. Buradaki değerler iOS tarafındaki
 * `modules/reel-exporter/ios/ReelFrame.swift` ile birebir aynı olmalı —
 * önizleme ile dışa aktarılan video aynı görünsün diye.
 */

export type TemplateId =
  | 'punch' | 'flash' | 'whip' | 'slide' | 'fade' | 'glitch' | 'flip' | 'film';

export type Template = { id: TemplateId; name: string; tr: number; kb: number; pulse: number };

export const TEMPLATES: Template[] = [
  { id: 'punch',  name: 'Zoom Punch', tr: 0.16, kb: 0.10, pulse: 1.0 },
  { id: 'flash',  name: 'Flash Cut',  tr: 0.13, kb: 0.06, pulse: 1.4 },
  { id: 'whip',   name: 'Whip Pan',   tr: 0.20, kb: 0.09, pulse: 0.8 },
  { id: 'slide',  name: 'Slide',      tr: 0.28, kb: 0.08, pulse: 0.6 },
  { id: 'fade',   name: 'Soft Fade',  tr: 0.42, kb: 0.14, pulse: 0.3 },
  { id: 'glitch', name: 'Glitch',     tr: 0.20, kb: 0.07, pulse: 1.1 },
  { id: 'flip',   name: 'Flip',       tr: 0.26, kb: 0.09, pulse: 0.7 },
  { id: 'film',   name: 'Polaroid',   tr: 0.30, kb: 0.07, pulse: 0.5 },
];

export const FILTERS = [
  { id: 'none',  name: 'Ham' },
  { id: 'vivid', name: 'Canlı' },
  { id: 'warm',  name: 'Sıcak' },
  { id: 'cool',  name: 'Soğuk' },
  { id: 'mono',  name: 'Siyah-Beyaz' },
  { id: 'film',  name: 'Film' },
  { id: 'vhs',   name: 'VHS' },
] as const;

export const TEXT_STYLES = [
  { id: 'bold',    name: 'Kalın' },
  { id: 'tape',    name: 'Bant' },
  { id: 'caption', name: 'Altyazı' },
  { id: 'ticker',  name: 'Şerit' },
] as const;

export const RATIOS: Record<Ratio, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '4:5':  { w: 1080, h: 1350 },
  '1:1':  { w: 1080, h: 1080 },
};

export const RATIO_VALUE: Record<Ratio, number> = {
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '1:1': 1,
};

export function templateById(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export const secPerBeat = (bpm: number) => 60 / bpm;

export type ClipTime = { start: number; dur: number };

export function clipTimes(clips: Clip[], bpm: number, fallbackBeats: number): ClipTime[] {
  const spb = secPerBeat(bpm);
  let acc = 0;
  return clips.map((c) => {
    const dur = (c.beats || fallbackBeats) * spb;
    const t = { start: acc, dur };
    acc += dur;
    return t;
  });
}

export function totalDuration(doc: Doc): number {
  const times = clipTimes(doc.clips, doc.bpm, doc.beatsPerClip);
  return times.length ? times[times.length - 1].start + times[times.length - 1].dur : 0;
}

export function indexAt(times: ClipTime[], t: number): number {
  'worklet';
  let idx = 0;
  for (let i = 0; i < times.length; i++) if (t >= times[i].start - 1e-6) idx = i;
  return idx;
}

export function easeOutCubic(t: number): number {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}
export function easeInOutCubic(t: number): number {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function clamp(v: number, a: number, b: number): number {
  'worklet';
  return v < a ? a : v > b ? b : v;
}

/** Bir karenin belirli bir anda nasıl görüneceği */
export type LayerState = {
  opacity: number;
  scale: number;
  translateX: number;
  translateY: number;
  rotate: number;
};

export const HIDDEN: LayerState = {
  opacity: 0, scale: 1, translateX: 0, translateY: 0, rotate: 0,
};

/**
 * `i` numaralı karenin `t` anındaki durumu. Hem şu anki hem bir önceki kare
 * için çağrılır; ilgili değilse opacity 0 döner.
 */
export function layerStateAt(
  i: number,
  t: number,
  times: ClipTime[],
  tpl: Template,
  boxW: number,
  bpm: number
): LayerState {
  'worklet';
  const n = times.length;
  if (!n) return HIDDEN;

  const total = times[n - 1].start + times[n - 1].dur;
  const tt = total > 0 ? ((t % total) + total) % total : 0;
  const idx = indexAt(times, tt);
  const prevIdx = idx > 0 ? idx - 1 : n > 1 ? n - 1 : -1;
  if (i !== idx && i !== prevIdx) return HIDDEN;

  const cur = times[idx];
  const local = tt - cur.start;
  const trDur = Math.min(tpl.tr, cur.dur * 0.45);
  const q = trDur > 0 ? clamp(local / trDur, 0, 1) : 1;
  const e = easeOutCubic(q);
  const isCur = i === idx;

  const pCur = clamp(local / cur.dur, 0, 1);
  const kbCur = 1 + tpl.kb * easeInOutCubic(pCur);
  let kbPrev = 1;
  if (prevIdx >= 0) {
    const pPrev = clamp((times[prevIdx].dur + local) / times[prevIdx].dur, 0, 1.3);
    kbPrev = 1 + tpl.kb * easeInOutCubic(Math.min(1, pPrev));
  }

  const spb = 60 / bpm;
  const pulse = Math.pow(1 - (tt % spb) / spb, 4);
  const ps = 1 + 0.032 * pulse * tpl.pulse;

  // önceki kare, geçiş bittikten sonra görünmez
  if (!isCur && q >= 1) return HIDDEN;

  let opacity = 1;
  let scale = isCur ? kbCur * ps : kbPrev * ps;
  let translateX = 0;
  const translateY = 0;
  let rotate = 0;

  if (tpl.id === 'fade') {
    opacity = isCur ? e : 1;
  } else if (tpl.id === 'punch') {
    if (isCur) {
      opacity = clamp(e * 1.7, 0, 1);
      scale = kbCur * ps * (1 + 0.55 * (1 - e));
    } else {
      scale = kbPrev * ps * (1 + 0.22 * e);
    }
  } else if (tpl.id === 'flash') {
    opacity = isCur ? 1 : 0;
  } else if (tpl.id === 'slide') {
    translateX = isCur ? (1 - e) * boxW : -e * boxW * 0.45;
  } else if (tpl.id === 'whip') {
    translateX = isCur ? (1 - e) * boxW * 1.15 : -e * boxW * 1.15;
  } else if (tpl.id === 'glitch') {
    opacity = isCur ? clamp(e * 2, 0, 1) : 1;
  } else if (tpl.id === 'flip') {
    // yatay sıkışma yerine ölçek+opaklık (RN'de scaleX ayrı verilir)
    opacity = isCur ? (q >= 0.5 ? 1 : 0) : q < 0.5 ? 1 : 0;
    const k = q < 0.5 ? easeOutCubic(q * 2) : easeOutCubic((q - 0.5) * 2);
    scale = (isCur ? kbCur : kbPrev) * ps * (isCur ? Math.max(0.02, k) : Math.max(0.02, 1 - k));
  } else if (tpl.id === 'film') {
    if (isCur) {
      opacity = e;
      scale = kbCur * ps * (0.86 + 0.14 * e);
      rotate = (1 - e) * 0.045;
    }
  }

  return { opacity, scale, translateX, translateY, rotate };
}

/** Flash şablonunun beyaz parlaması */
export function flashAlphaAt(t: number, times: ClipTime[], tpl: Template): number {
  'worklet';
  if (tpl.id !== 'flash' || !times.length) return 0;
  const n = times.length;
  const total = times[n - 1].start + times[n - 1].dur;
  const tt = total > 0 ? ((t % total) + total) % total : 0;
  const idx = indexAt(times, tt);
  const local = tt - times[idx].start;
  const trDur = Math.min(tpl.tr, times[idx].dur * 0.45);
  if (trDur <= 0) return 0;
  const q = clamp(local / trDur, 0, 1);
  return (1 - q) * 0.8;
}

/** Yazı katmanının `t` anındaki opaklığı ve giriş animasyonu */
export function textStateAt(
  t: number,
  totalSec: number,
  bpm: number,
  introOnly: boolean
): { opacity: number; scale: number; rise: number } {
  'worklet';
  const tt = totalSec > 0 ? ((t % totalSec) + totalSec) % totalSec : 0;
  const introLen = (60 / bpm) * 4;
  let vis = 1;
  if (introOnly) {
    if (tt > introLen) return { opacity: 0, scale: 1, rise: 0 };
    vis = easeOutCubic(clamp((introLen - tt) / 0.3, 0, 1));
  }
  const inE = easeOutCubic(clamp(tt / 0.34, 0, 1));
  return { opacity: vis, scale: 0.94 + 0.06 * inE, rise: (1 - inE) * 0.018 };
}

/** Kadraj kaydırmanın piksel karşılığı (kutu ölçüsüne göre) */
export function panOffset(clip: Clip, boxW: number, boxH: number, scale: number) {
  'worklet';
  const swap = clip.rot === 90 || clip.rot === 270;
  const iw = swap ? clip.h : clip.w;
  const ih = swap ? clip.w : clip.h;
  const cover = Math.max(boxW / iw, boxH / ih) * scale * clip.zoom;
  const rw = iw * cover;
  const rh = ih * cover;
  return {
    x: clip.ox * Math.max(0, (rw - boxW) / 2),
    y: clip.oy * Math.max(0, (rh - boxH) / 2),
  };
}
