import { Directory, File, Paths } from 'expo-file-system';
import type { Doc, Project } from './types';

const ROOT = new Directory(Paths.document, 'reel-atolyesi');
const MEDIA = new Directory(ROOT, 'media');
const INDEX = new File(ROOT, 'projects.json');

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function ensureDirs() {
  if (!ROOT.exists) ROOT.create({ intermediates: true });
  if (!MEDIA.exists) MEDIA.create({ intermediates: true });
}

export function blankDoc(): Doc {
  return {
    ratio: '9:16',
    template: 'punch',
    filter: 'vivid',
    vignette: true,
    grain: false,
    bpm: 110,
    beatsPerClip: 2,
    audio: { kind: 'builtin', beatId: 'pop' },
    audioStart: 0,
    clips: [],
    layers: [],
    handle: '',
  };
}

export async function loadProjects(): Promise<Project[]> {
  ensureDirs();
  if (!INDEX.exists) return [];
  try {
    const raw = await INDEX.text();
    const list = JSON.parse(raw) as Project[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p && p.id && p.doc)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  } catch {
    return [];
  }
}

export function writeProjects(list: Project[]) {
  ensureDirs();
  try {
    INDEX.write(JSON.stringify(list));
  } catch {
    // disk dolu veya erişilemiyor — çağıran tarafta uyarılır
  }
}

export async function upsertProject(project: Project): Promise<Project[]> {
  const list = await loadProjects();
  const i = list.findIndex((p) => p.id === project.id);
  if (i >= 0) list[i] = project;
  else list.unshift(project);
  writeProjects(list);
  return list;
}

export async function deleteProject(id: string): Promise<Project[]> {
  const list = await loadProjects();
  const target = list.find((p) => p.id === id);
  const rest = list.filter((p) => p.id !== id);
  writeProjects(rest);

  // başka projede kullanılmayan medyayı sil
  if (target) {
    const used = new Set<string>();
    rest.forEach((p) => {
      p.doc.clips.forEach((c) => used.add(c.uri));
      if (p.doc.audio.kind === 'file') used.add(p.doc.audio.uri);
    });
    const mine: string[] = target.doc.clips.map((c) => c.uri);
    if (target.doc.audio.kind === 'file') mine.push(target.doc.audio.uri);
    mine.forEach((uri) => {
      if (used.has(uri)) return;
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // yoksay
      }
    });
  }
  return rest;
}

/** Seçilen fotoğrafı uygulamanın kendi klasörüne kopyalar (kaynak geçici olabilir) */
export function importMedia(sourceUri: string, extension = '.jpg'): string {
  ensureDirs();
  const name = uid() + extension;
  const dest = new File(MEDIA, name);
  try {
    const src = new File(sourceUri);
    src.copy(dest);
    return dest.uri;
  } catch {
    // kopyalanamazsa kaynağı olduğu gibi kullan
    return sourceUri;
  }
}

export function extensionOf(uri: string, fallback = '.jpg'): string {
  const clean = uri.split('?')[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0 || dot < clean.length - 6) return fallback;
  return clean.slice(dot).toLowerCase();
}

export function mediaExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
