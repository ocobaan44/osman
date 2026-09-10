// Instagram büyüme sistemi için ortak tipler.

/** İçerik biçimi. Instagram'da dağıtım motoru her biri için farklı çalışır. */
export type Format = "reel" | "carousel" | "single" | "story";

/** Bir gönderinin hedeflediği ana davranış. Erişimi asıl bu belirler. */
export type Driver = "share" | "save" | "comment" | "watch";

/**
 * Gönderinin nasıl çekileceği. Yüz ve ses kullanılmayan üretimde sahne
 * akışı tamamen değişir: anlatım ekran üstü yazıya taşınır.
 */
export type ProductionMode = "onCamera" | "faceless";

/** Kullanıcının hesap profili. Öneriler bu bağlama göre şekillenir. */
export interface Profile {
  handle: string;
  niche: string;
  /** Takipçi sayısı. Erişim oranlarını normalize etmek için kullanılır. */
  followers: number;
  /** Haftada kaç gönderi planlanacak. */
  postsPerWeek: number;
  /** Hesabın tekrar tekrar döndüğü ana temalar. */
  pillars: string[];
  /** Çekim biçimi. Plan sahne akışını buna göre üretir. */
  productionMode: ProductionMode;
}

/** Planlanmış ama henüz yayınlanmamış bir gönderi fikri. */
export interface ContentIdea {
  id: string;
  day: number;
  date: string;
  format: Format;
  driver: Driver;
  pillar: string;
  /** İlk 3 saniyede söylenecek/yazılacak cümle. */
  hook: string;
  /** Gönderinin iskeleti: sahne sahne ne olacak. */
  beats: string[];
  caption: string;
  cta: string;
}

/** Skorlanacak gönderi taslağı. */
export interface Draft {
  hook: string;
  format: Format;
  driver: Driver;
  /** Reel süresi (saniye). Reel dışı biçimlerde göz ardı edilir. */
  durationSec?: number;
  caption?: string;
  cta?: string;
  /** Görsel/işitsel kurgu notları: kesme sayısı, altyazı, trend ses vb. */
  beats?: string[];
  /** İçerik kapanışta başa dönüyor mu (loop). Tutunmayı ciddi artırır. */
  loops?: boolean;
  /** Trend olan bir sesi kullanıyor mu. */
  trendingAudio?: boolean;
  /** Ekranda yanık altyazı var mı. Sessiz izleyici çoğunluktadır. */
  captionsBurned?: boolean;
}

/** Skorlamanın tek bir boyutu. */
export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  max: number;
  /** Puanın neden bu olduğunu açıklayan kısa gerekçe. */
  reason: string;
  /** Puanı yükseltmek için somut düzeltme. Zaten tamsa boş. */
  fix?: string;
}

export interface ScoreResult {
  total: number;
  max: number;
  grade: "A" | "B" | "C" | "D";
  verdict: string;
  dimensions: ScoreDimension[];
}

/** Yayınlanmış bir gönderinin gerçek performansı. */
export interface PostMetrics {
  id: string;
  date: string;
  format: Format;
  pillar?: string;
  hook?: string;
  /** Toplam erişilen hesap sayısı. */
  reach: number;
  /** DM/story ile paylaşım sayısı. Erişimin en güçlü tek yordayıcısı. */
  shares: number;
  saves: number;
  likes: number;
  comments: number;
  /** Bu gönderiden gelen yeni takipçi. */
  follows: number;
  /** Ortalama izlenme süresi (saniye). Sadece reel. */
  avgWatchSec?: number;
  durationSec?: number;
}

/** Tek bir gönderinin türetilmiş oranları ve sınıfı. */
export interface PostAnalysis {
  post: PostMetrics;
  reachRate: number;
  shareRate: number;
  saveRate: number;
  followRate: number;
  engagementRate: number;
  /** İzlenme oranı: ortalama izlenme / süre. Sadece reel. */
  retention: number | null;
  klass: "viral-motor" | "sağlam" | "dönüştürüyor" | "ölü";
}

export interface AccountReport {
  profile: Profile;
  postCount: number;
  median: {
    reachRate: number;
    shareRate: number;
    saveRate: number;
    followRate: number;
  };
  analyses: PostAnalysis[];
  /** Paylaşım oranına göre en iyi performans gösteren temalar. */
  topPillars: Array<{ pillar: string; posts: number; medianShareRate: number }>;
  topFormats: Array<{ format: Format; posts: number; medianShareRate: number }>;
  /** Verinin söylediği somut aksiyonlar. */
  actions: string[];
}
