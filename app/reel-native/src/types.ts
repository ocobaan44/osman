export type Ratio = '9:16' | '4:5' | '1:1';
export type TextStyleId = 'bold' | 'tape' | 'caption' | 'ticker';

export type Clip = {
  id: string;
  /** Proje klasörüne kopyalanmış fotoğrafın file:// adresi */
  uri: string;
  w: number;
  h: number;
  beats: number;
  zoom: number;
  ox: number;
  oy: number;
  rot: number;
};

export type TextLayer = {
  id: string;
  text: string;
  style: TextStyleId;
  xf: number;
  yf: number;
  size: number;
  introOnly: boolean;
};

export type AudioChoice =
  | { kind: 'builtin'; beatId: string }
  | { kind: 'file'; uri: string; name: string }
  | { kind: 'none' };

export type Doc = {
  ratio: Ratio;
  template: string;
  filter: string;
  vignette: boolean;
  grain: boolean;
  bpm: number;
  beatsPerClip: number;
  audio: AudioChoice;
  audioStart: number;
  clips: Clip[];
  layers: TextLayer[];
  handle: string;
};

export type Project = {
  id: string;
  name: string;
  updated: number;
  cover?: string;
  dur: number;
  doc: Doc;
};
