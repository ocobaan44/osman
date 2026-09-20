import { Asset } from 'expo-asset';

/**
 * Dahili ritimler 100 BPM referansla üretildi (bkz. tools/make-beats.js).
 * Hedef tempoya `playbackRate` ile çekilir.
 */
export const BEAT_BPM = 100;

export const BEATS = [
  { id: 'pop',   name: 'Pop',        module: require('../assets/beats/pop.wav') },
  { id: 'trap',  name: 'Trap',       module: require('../assets/beats/trap.wav') },
  { id: 'house', name: 'House',      module: require('../assets/beats/house.wav') },
  { id: 'lofi',  name: 'Lo-fi',      module: require('../assets/beats/lofi.wav') },
  { id: 'cine',  name: 'Sinematik',  module: require('../assets/beats/cine.wav') },
] as const;

export type BeatId = (typeof BEATS)[number]['id'];

export function beatById(id: string) {
  return BEATS.find((b) => b.id === id) ?? BEATS[0];
}

/** Ritmin hedef tempoda çalması için gereken oran (aşırı bozulmayı önlemek için sınırlı) */
export function rateForBpm(bpm: number): number {
  return Math.max(0.55, Math.min(1.85, bpm / BEAT_BPM));
}

const cache = new Map<string, string>();

/** Paketlenmiş ses dosyasının diskteki yolunu verir (native oynatıcı için gerekli) */
export async function beatUri(id: string): Promise<string | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  try {
    const asset = Asset.fromModule(beatById(id).module);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (uri) cache.set(id, uri);
    return uri ?? null;
  } catch {
    return null;
  }
}
