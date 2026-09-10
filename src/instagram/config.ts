// Profil ve gönderi verisinin diskteki hali.

import * as fs from "fs";
import * as path from "path";
import { PostMetrics, Profile } from "./types";

export const CONFIG_FILE = "instagram.config.json";
export const POSTS_FILE = path.join("data", "instagram-posts.json");

export const DEFAULT_PROFILE: Profile = {
  handle: "hesabim",
  niche: "otomotiv",
  followers: 1000,
  postsPerWeek: 5,
  pillars: ["araç seçimi", "satın alma tuzakları", "bakım ve maliyet", "perde arkası"],
  productionMode: "onCamera",
};

function resolve(root: string, file: string): string {
  return path.isAbsolute(file) ? file : path.join(root, file);
}

export function loadProfile(root: string): Profile {
  const file = resolve(root, CONFIG_FILE);
  if (!fs.existsSync(file)) return DEFAULT_PROFILE;

  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Profile>;
  return { ...DEFAULT_PROFILE, ...parsed };
}

export function saveProfile(root: string, profile: Profile): string {
  const file = resolve(root, CONFIG_FILE);
  fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return file;
}

export function loadPosts(root: string): PostMetrics[] {
  const file = resolve(root, POSTS_FILE);
  if (!fs.existsSync(file)) return [];

  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  return Array.isArray(parsed) ? (parsed as PostMetrics[]) : [];
}

export function savePosts(root: string, posts: PostMetrics[]): string {
  const file = resolve(root, POSTS_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
  return file;
}

/** Aynı id'li kayıt varsa üzerine yazar, yoksa ekler. */
export function upsertPost(posts: PostMetrics[], post: PostMetrics): PostMetrics[] {
  const index = posts.findIndex((p) => p.id === post.id);
  if (index === -1) return [...posts, post];

  const next = [...posts];
  next[index] = post;
  return next;
}

/**
 * Hook şablonları tema adını cümlenin ortasına gömer. Uzun ya da yan cümle
 * içeren tema adları bu şablonlarda devrik cümle üretir, o yüzden init
 * sırasında uyarıyoruz. Hata değil: kullanıcı yine de devam edebilir.
 */
export const PILLAR_MAX_WORDS = 3;
export const PILLAR_MAX_CHARS = 22;

export function checkPillars(pillars: string[]): string[] {
  return pillars.flatMap((pillar) => {
    const words = pillar.trim().split(/\s+/).length;
    if (words > PILLAR_MAX_WORDS || pillar.length > PILLAR_MAX_CHARS) {
      return [
        `"${pillar}" hook şablonlarına uzun geliyor (${words} kelime, ${pillar.length} karakter). ` +
          `En fazla ${PILLAR_MAX_WORDS} kelime / ${PILLAR_MAX_CHARS} karakter önerilir, yoksa hook cümlesi devrik olur.`,
      ];
    }
    return [];
  });
}
