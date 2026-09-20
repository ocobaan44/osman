import { NativeModule, requireOptionalNativeModule } from 'expo';

export type ExportClip = {
  uri: string;
  /** Reel içindeki başlangıç anı (saniye) */
  start: number;
  duration: number;
  rot: number;
  zoom: number;
  ox: number;
  oy: number;
};

export type ExportText = {
  text: string;
  style: 'bold' | 'tape' | 'caption' | 'ticker';
  xf: number;
  yf: number;
  size: number;
  introOnly: boolean;
};

export type ExportSpec = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  template: string;
  filter: string;
  vignette: boolean;
  grain: boolean;
  bpm: number;
  clips: ExportClip[];
  texts: ExportText[];
  handle: string;
  audio?: { uri: string; startSec: number; rate: number };
  fileName: string;
};

type ExporterEvents = {
  onExportProgress: (payload: { progress: number }) => void;
};

declare class ReelExporterModule extends NativeModule<ExporterEvents> {
  isAvailable(): boolean;
  exportReel(spec: ExportSpec): Promise<{ uri: string }>;
}

/**
 * Yerel native modül. Expo Go'da `null` döner — Expo Go özel native kod
 * çalıştıramaz, dışa aktarma için development build gerekir.
 */
const ReelExporter = requireOptionalNativeModule<ReelExporterModule>('ReelExporter');

export const isExportAvailable = (): boolean => {
  try {
    return !!ReelExporter && ReelExporter.isAvailable();
  } catch {
    return false;
  }
};

export async function exportReel(
  spec: ExportSpec,
  onProgress?: (p: number) => void
): Promise<string> {
  if (!ReelExporter) {
    throw new Error(
      'Video dışa aktarma bu yapıda kullanılamıyor. Expo Go özel native kod çalıştıramaz; ' +
        'development build ile aç (README’deki adımlar).'
    );
  }
  const sub = onProgress
    ? ReelExporter.addListener('onExportProgress', ({ progress }) => onProgress(progress))
    : null;
  try {
    const { uri } = await ReelExporter.exportReel(spec);
    return uri;
  } finally {
    sub?.remove();
  }
}

export default ReelExporter;
