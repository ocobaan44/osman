import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { C } from '../theme';
import type { Clip, Doc, Project, Ratio, TextStyleId } from '../types';
import {
  FILTERS,
  RATIOS,
  RATIO_VALUE,
  TEMPLATES,
  TEXT_STYLES,
  clipTimes,
  secPerBeat,
  totalDuration,
} from '../engine';
import { BEATS, beatUri, rateForBpm } from '../beats';
import { extensionOf, importMedia, uid } from '../store';
import ReelStage from '../components/ReelStage';
import { Btn, Chip, Label, Slider } from '../components/ui';
import { exportReel, isExportAvailable } from '../../modules/reel-exporter';

type Tab = 'template' | 'media' | 'music' | 'text' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'template', label: 'Şablon' },
  { id: 'media', label: 'Medya' },
  { id: 'music', label: 'Müzik' },
  { id: 'text', label: 'Yazı' },
  { id: 'export', label: 'Aktar' },
];

export default function EditorScreen({
  project,
  onChange,
  onBack,
}: {
  project: Project;
  onChange: (p: Project) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  const [doc, setDoc] = useState<Doc>(project.doc);
  const [name, setName] = useState(project.name);
  const [tab, setTab] = useState<Tab>('template');
  const [selClip, setSelClip] = useState(-1);
  const [selLayer, setSelLayer] = useState(doc.layers.length ? 0 : -1);
  const [sheetClip, setSheetClip] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastVideo, setLastVideo] = useState<string | null>(null);
  const undoStack = useRef<Doc[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const clock = useSharedValue(0);
  const player = useRef<AudioPlayer | null>(null);

  const times = useMemo(
    () => clipTimes(doc.clips, doc.bpm, doc.beatsPerClip),
    [doc.clips, doc.bpm, doc.beatsPerClip]
  );
  const total = useMemo(() => totalDuration(doc), [doc]);

  // ---- kalıcılık ----
  useEffect(() => {
    const t = setTimeout(() => {
      onChange({
        ...project,
        name: name.trim() || 'Adsız',
        doc,
        dur: total,
        updated: Date.now(),
        cover: doc.clips[0]?.uri,
      });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, name, total]);

  // ---- saat ----
  const frame = useFrameCallback((info) => {
    'worklet';
    if (total <= 0) return;
    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;
    clock.value = (clock.value + dt) % total;
  }, false);

  useEffect(() => {
    frame.setActive(playing);
  }, [playing, frame]);

  // ---- ses ----
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      try {
        player.current?.remove();
      } catch {
        /* yoksay */
      }
      player.current = null;
    };
  }, []);

  const loadAudio = useCallback(async () => {
    try {
      player.current?.remove();
    } catch {
      /* yoksay */
    }
    player.current = null;
    let uri: string | null = null;
    let rate = 1;
    if (doc.audio.kind === 'builtin') {
      uri = await beatUri(doc.audio.beatId);
      rate = rateForBpm(doc.bpm);
    } else if (doc.audio.kind === 'file') {
      uri = doc.audio.uri;
    }
    if (!uri) return;
    const p = createAudioPlayer({ uri });
    p.loop = true;
    p.volume = 1;
    if (rate !== 1) p.setPlaybackRate(rate);
    player.current = p;
  }, [doc.audio, doc.bpm]);

  useEffect(() => {
    loadAudio();
  }, [loadAudio]);

  const togglePlay = useCallback(async () => {
    if (!doc.clips.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (playing) {
      setPlaying(false);
      player.current?.pause();
      return;
    }
    const start = doc.audio.kind === 'file' ? doc.audioStart : 0;
    try {
      await player.current?.seekTo(start + clock.value);
      player.current?.play();
    } catch {
      /* ses olmadan da oynatılır */
    }
    setPlaying(true);
  }, [playing, doc.clips.length, doc.audio, doc.audioStart, clock]);

  // ---- düzenleme yardımcıları ----
  const pushUndo = useCallback(() => {
    undoStack.current.push(JSON.parse(JSON.stringify(doc)));
    if (undoStack.current.length > 25) undoStack.current.shift();
    setCanUndo(true);
  }, [doc]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setPlaying(false);
    player.current?.pause();
    clock.value = 0;
    setDoc(prev);
    setCanUndo(undoStack.current.length > 0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [clock]);

  const patch = useCallback((p: Partial<Doc>) => setDoc((d) => ({ ...d, ...p })), []);

  const patchClip = useCallback((i: number, p: Partial<Clip>) => {
    setDoc((d) => {
      const clips = d.clips.slice();
      if (!clips[i]) return d;
      clips[i] = { ...clips[i], ...p };
      return { ...d, clips };
    });
  }, []);

  const addPhotos = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraflara erişim izni vermen gerekiyor.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 0.92,
    });
    if (res.canceled || !res.assets.length) return;
    pushUndo();
    const added: Clip[] = res.assets.map((a) => ({
      id: uid(),
      uri: importMedia(a.uri, extensionOf(a.uri)),
      w: a.width || 1080,
      h: a.height || 1440,
      beats: doc.beatsPerClip,
      zoom: 1,
      ox: 0,
      oy: 0,
      rot: 0,
    }));
    setPlaying(false);
    player.current?.pause();
    clock.value = 0;
    setDoc((d) => ({ ...d, clips: [...d.clips, ...added] }));
    setStatus(`${added.length} kare eklendi`);
  }, [doc.beatsPerClip, pushUndo, clock]);

  const pickAudio = useCallback(async () => {
    // Ses dosyası seçimi için görsel seçiciyi kullanmıyoruz; belge seçici gerekir.
    const { File } = await import('expo-file-system');
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['audio/*'] });
      if (!picked || picked.canceled) return;
      const chosen = picked.result;
      pushUndo();
      const uri = importMedia(chosen.uri, extensionOf(chosen.uri, '.m4a'));
      patch({ audio: { kind: 'file', uri, name: chosen.name }, audioStart: 0 });
      setStatus('Müzik eklendi');
    } catch {
      Alert.alert('Ses seçilemedi', 'Bu cihazda dosya seçici açılamadı.');
    }
  }, [patch, pushUndo]);

  // ---- dışa aktarma ----
  const doExport = useCallback(async () => {
    if (!doc.clips.length) return;
    setPlaying(false);
    player.current?.pause();

    if (!isExportAvailable()) {
      Alert.alert(
        'Development build gerekiyor',
        'Video oluşturma özel native kod kullanır; Expo Go bunu çalıştıramaz. ' +
          'README’deki "development build" adımlarını izle.'
      );
      return;
    }
    setBusy(true);
    setProgress(0);
    setStatus('Video oluşturuluyor…');
    try {
      const size = RATIOS[doc.ratio];
      let audio: { uri: string; startSec: number; rate: number } | undefined;
      if (doc.audio.kind === 'builtin') {
        const uri = await beatUri(doc.audio.beatId);
        if (uri) audio = { uri, startSec: 0, rate: rateForBpm(doc.bpm) };
      } else if (doc.audio.kind === 'file') {
        audio = { uri: doc.audio.uri, startSec: doc.audioStart, rate: 1 };
      }
      const uri = await exportReel(
        {
          width: size.w,
          height: size.h,
          fps: 30,
          duration: total,
          template: doc.template,
          filter: doc.filter,
          vignette: doc.vignette,
          grain: doc.grain,
          bpm: doc.bpm,
          clips: doc.clips.map((c, i) => ({
            uri: c.uri,
            start: times[i].start,
            duration: times[i].dur,
            rot: c.rot,
            zoom: c.zoom,
            ox: c.ox,
            oy: c.oy,
          })),
          texts: doc.layers
            .filter((l) => l.text.trim())
            .map((l) => ({
              text: l.text,
              style: l.style,
              xf: l.xf,
              yf: l.yf,
              size: l.size,
              introOnly: l.introOnly,
            })),
          handle: doc.handle,
          audio,
          fileName: `${(name || 'reel').replace(/[^\w-]+/g, '-').toLowerCase()}.mp4`,
        },
        setProgress
      );
      setLastVideo(uri);
      setStatus('Video hazır');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      setStatus('');
      Alert.alert('Oluşturulamadı', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [doc, total, times, name]);

  const saveToPhotos = useCallback(async () => {
    if (!lastVideo) return;
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Videoyu kaydetmek için Fotoğraflar izni ver.');
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(lastVideo);
      setStatus('Fotoğraflar’a kaydedildi');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Kaydedilemedi', e?.message ?? String(e));
    }
  }, [lastVideo]);

  // ---- ölçüler ----
  const stageMaxH = Math.max(180, win.height * 0.42);
  const ratioV = RATIO_VALUE[doc.ratio];
  let stageH = stageMaxH;
  let stageW = stageH * ratioV;
  const maxW = win.width - 32;
  if (stageW > maxW) {
    stageW = maxW;
    stageH = stageW / ratioV;
  }

  const playheadStyle = useAnimatedStyle(() => ({
    left: total > 0 ? `${(clock.value / total) * 100}%` : '0%',
  }));

  const panTarget = useMemo(() => {
    if (tab === 'media' && doc.clips.length) return { kind: 'clip' as const, index: -1 };
    if (tab === 'text' && selLayer >= 0) return { kind: 'text' as const, index: selLayer };
    return null;
  }, [tab, doc.clips.length, selLayer]);

  const panBase = useRef<{ ox: number; oy: number; i: number } | null>(null);

  const onPan = useCallback(
    (dx: number, dy: number) => {
      if (tab === 'text' && selLayer >= 0) {
        setDoc((d) => {
          const layers = d.layers.slice();
          const L = layers[selLayer];
          if (!L) return d;
          layers[selLayer] = {
            ...L,
            xf: Math.max(0.05, Math.min(0.95, (panBase.current?.ox ?? L.xf) + dx)),
            yf: Math.max(0.05, Math.min(0.95, (panBase.current?.oy ?? L.yf) + dy)),
          };
          return { ...d, layers };
        });
        return;
      }
      if (tab === 'media') {
        const idx = indexAtJS(times, clock.value);
        if (idx < 0) return;
        const base = panBase.current?.i === idx ? panBase.current : null;
        const clip = doc.clips[idx];
        if (!clip) return;
        patchClip(idx, {
          ox: Math.max(-1, Math.min(1, (base?.ox ?? clip.ox) - dx * 2.2)),
          oy: Math.max(-1, Math.min(1, (base?.oy ?? clip.oy) - dy * 2.2)),
        });
      }
    },
    [tab, selLayer, times, clock, doc.clips, patchClip]
  );

  const onPanEnd = useCallback(() => {
    panBase.current = null;
  }, []);

  useEffect(() => {
    // sürükleme başlangıç değerlerini yakala
    if (tab === 'text' && selLayer >= 0) {
      const L = doc.layers[selLayer];
      if (L) panBase.current = { ox: L.xf, oy: L.yf, i: -1 };
    } else {
      panBase.current = null;
    }
  }, [tab, selLayer, doc.layers]);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* üst bar */}
      <View style={st.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Geri" onPress={onBack} style={st.ico}>
          <Text style={st.icoText}>‹</Text>
        </Pressable>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={40}
          accessibilityLabel="Proje adı"
          style={st.nameInput}
          placeholderTextColor={C.dim}
          placeholder="Proje adı"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri al"
          disabled={!canUndo}
          onPress={undo}
          style={[st.ico, !canUndo && { opacity: 0.35 }]}>
          <Text style={st.icoText}>⟲</Text>
        </Pressable>
        <View style={st.ratios}>
          {(Object.keys(RATIOS) as Ratio[]).map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityState={{ selected: doc.ratio === r }}
              onPress={() => patch({ ratio: r })}
              style={[st.ratioBtn, doc.ratio === r && st.ratioOn]}>
              <Text style={[st.ratioText, doc.ratio === r && { color: C.text }]}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* sahne */}
      <View style={st.stageWrap}>
        {doc.clips.length ? (
          <ReelStage
            doc={doc}
            clock={clock}
            width={stageW}
            height={stageH}
            panTarget={panTarget}
            onPan={onPan}
            onPanEnd={onPanEnd}
          />
        ) : (
          <View style={[st.emptyStage, { width: stageW, height: stageH }]}>
            <Text style={st.emptyText}>Fotoğraf ekleyince reel burada oynar.</Text>
            <Btn label="Fotoğraf ekle" primary onPress={addPhotos} />
          </View>
        )}
      </View>

      {/* zaman çizgisi */}
      <View style={st.tlWrap}>
        <View style={st.timeline}>
          {doc.clips.length ? (
            doc.clips.map((c, i) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Kare ${i + 1}`}
                onPress={() => {
                  clock.value = times[i].start + times[i].dur * 0.5;
                  setSelClip(i);
                }}
                style={[
                  st.tlClip,
                  { flexGrow: times[i].dur, borderColor: i === selClip ? C.hot : 'transparent' },
                ]}>
                <Image source={{ uri: c.uri }} style={StyleSheet.absoluteFill} />
                <Text style={st.tlNum}>{i + 1}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={st.tlEmpty}>Zaman çizgisi boş</Text>
          )}
          <Animated.View pointerEvents="none" style={[st.playhead, playheadStyle]} />
        </View>
      </View>

      {/* transport */}
      <View style={st.transport}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Duraklat' : 'Oynat'}
          disabled={!doc.clips.length}
          onPress={togglePlay}
          style={[st.play, !doc.clips.length && { opacity: 0.4 }]}>
          <Text style={st.playIcon}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Text style={st.time}>{total.toFixed(1)} sn</Text>
        {status ? <Text style={st.status}>{status}</Text> : null}
      </View>

      {/* paneller */}
      <ScrollView style={st.panel} contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
        {tab === 'template' && (
          <>
            <Label>Geçiş şablonu</Label>
            <View style={st.row}>
              {TEMPLATES.map((t) => (
                <Chip
                  key={t.id}
                  label={t.name}
                  active={doc.template === t.id}
                  onPress={() => patch({ template: t.id })}
                />
              ))}
            </View>
            <View style={{ height: 16 }} />
            <Label>Renk filtresi</Label>
            <View style={st.row}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.id}
                  label={f.name}
                  active={doc.filter === f.id}
                  onPress={() => patch({ filter: f.id })}
                />
              ))}
            </View>
            <View style={{ height: 16 }} />
            <Label>Doku</Label>
            <View style={st.row}>
              <Chip
                label="Kenar karartma"
                active={doc.vignette}
                onPress={() => patch({ vignette: !doc.vignette })}
              />
            </View>
          </>
        )}

        {tab === 'media' && (
          <>
            <Label right={doc.clips.length ? `${doc.clips.length} kare · ${total.toFixed(1)} sn` : undefined}>
              Kareler
            </Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={st.strip}>
                {doc.clips.map((c, i) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Kare ${i + 1} ayarları`}
                    onPress={() => setSheetClip(i)}
                    style={[st.thumb, i === selClip && { borderColor: C.hot }]}>
                    <Image source={{ uri: c.uri }} style={StyleSheet.absoluteFill} />
                    <Text style={st.thumbNum}>{i + 1}</Text>
                    <Text style={st.thumbDur}>
                      {((c.beats || doc.beatsPerClip) * secPerBeat(doc.bpm)).toFixed(1)}s
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fotoğraf ekle"
                  onPress={addPhotos}
                  style={st.addTile}>
                  <Text style={{ color: C.muted, fontSize: 20 }}>+</Text>
                </Pressable>
              </View>
            </ScrollView>
            <Text style={st.hint}>
              Kareye dokun → süre, yakınlaştırma, döndürme. Önizlemede parmağını sürükleyerek kadrajı
              kaydır.
            </Text>
            <View style={{ height: 16 }} />
            <Label right={`${doc.beatsPerClip} vuruş`}>Varsayılan kare süresi</Label>
            <View style={st.row}>
              <Slider
                label="Kare başına vuruş"
                value={doc.beatsPerClip}
                min={1}
                max={8}
                onChange={(v) => patch({ beatsPerClip: v })}
              />
            </View>
            <View style={{ height: 10 }} />
            <Btn
              label="Tüm karelere uygula"
              wide
              onPress={() => {
                pushUndo();
                setDoc((d) => ({
                  ...d,
                  clips: d.clips.map((c) => ({ ...c, beats: d.beatsPerClip })),
                }));
              }}
            />
          </>
        )}

        {tab === 'music' && (
          <>
            <Label>Dahili ritim</Label>
            <View style={st.row}>
              {BEATS.map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  active={doc.audio.kind === 'builtin' && doc.audio.beatId === b.id}
                  onPress={() => patch({ audio: { kind: 'builtin', beatId: b.id }, audioStart: 0 })}
                />
              ))}
              <Chip
                label="Müziksiz"
                active={doc.audio.kind === 'none'}
                onPress={() => patch({ audio: { kind: 'none' } })}
              />
            </View>
            <View style={{ height: 16 }} />
            <Label>Kendi müziğin</Label>
            <View style={st.row}>
              <Btn label="Ses dosyası seç" onPress={pickAudio} />
              {doc.audio.kind === 'file' ? (
                <Btn
                  label="Kaldır"
                  onPress={() => patch({ audio: { kind: 'builtin', beatId: 'pop' }, audioStart: 0 })}
                />
              ) : null}
            </View>
            {doc.audio.kind === 'file' ? (
              <Text style={st.hint}>{doc.audio.name}</Text>
            ) : null}
            <View style={{ height: 16 }} />
            <Label right={`${doc.bpm} BPM`}>Tempo</Label>
            <View style={st.row}>
              <Slider
                label="Tempo"
                value={doc.bpm}
                min={60}
                max={180}
                onChange={(v) => patch({ bpm: v })}
              />
            </View>
            <Text style={st.hint}>
              Dahili ritimler bu tempoya çekilir. Kendi parçanda tempo, kesimlerin nereye denk
              geleceğini belirler.
            </Text>
          </>
        )}

        {tab === 'text' && (
          <>
            <Label right="önizlemede sürükle">Yazı katmanları</Label>
            {doc.layers.map((L, i) => (
              <Pressable
                key={L.id}
                accessibilityRole="button"
                onPress={() => setSelLayer(i)}
                style={[st.layerRow, i === selLayer && { borderColor: C.hot }]}>
                <Text numberOfLines={1} style={{ color: C.text, flex: 1 }}>
                  {L.text || '(boş yazı)'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Yazıyı sil"
                  hitSlop={8}
                  onPress={() => {
                    pushUndo();
                    setDoc((d) => ({ ...d, layers: d.layers.filter((_, j) => j !== i) }));
                    setSelLayer((s) => Math.min(s, doc.layers.length - 2));
                  }}>
                  <Text style={{ color: C.muted, paddingHorizontal: 6 }}>✕</Text>
                </Pressable>
              </Pressable>
            ))}
            <View style={{ height: 8 }} />
            <Btn
              label="+ Yazı ekle"
              wide
              onPress={() => {
                pushUndo();
                setDoc((d) => ({
                  ...d,
                  layers: [
                    ...d.layers,
                    {
                      id: uid(),
                      text: '',
                      style: 'bold' as TextStyleId,
                      xf: 0.5,
                      yf: 0.8,
                      size: 100,
                      introOnly: true,
                    },
                  ],
                }));
                setSelLayer(doc.layers.length);
              }}
            />
            {selLayer >= 0 && doc.layers[selLayer] ? (
              <>
                <View style={{ height: 16 }} />
                <Label>Metin</Label>
                <TextInput
                  value={doc.layers[selLayer].text}
                  onChangeText={(v) =>
                    setDoc((d) => {
                      const layers = d.layers.slice();
                      layers[selLayer] = { ...layers[selLayer], text: v };
                      return { ...d, layers };
                    })
                  }
                  placeholder="Yazını gir"
                  placeholderTextColor={C.dim}
                  style={st.field}
                  maxLength={60}
                />
                <View style={{ height: 12 }} />
                <Label>Stil</Label>
                <View style={st.row}>
                  {TEXT_STYLES.map((sOpt) => (
                    <Chip
                      key={sOpt.id}
                      label={sOpt.name}
                      active={doc.layers[selLayer].style === sOpt.id}
                      onPress={() =>
                        setDoc((d) => {
                          const layers = d.layers.slice();
                          layers[selLayer] = { ...layers[selLayer], style: sOpt.id };
                          return { ...d, layers };
                        })
                      }
                    />
                  ))}
                </View>
                <View style={{ height: 12 }} />
                <Label right={`%${doc.layers[selLayer].size}`}>Boyut</Label>
                <View style={st.row}>
                  <Slider
                    label="Yazı boyutu"
                    value={doc.layers[selLayer].size}
                    min={40}
                    max={180}
                    onChange={(v) =>
                      setDoc((d) => {
                        const layers = d.layers.slice();
                        layers[selLayer] = { ...layers[selLayer], size: v };
                        return { ...d, layers };
                      })
                    }
                  />
                </View>
                <View style={{ height: 12 }} />
                <View style={st.row}>
                  <Chip
                    label={doc.layers[selLayer].introOnly ? 'Sadece başta' : 'Tüm video'}
                    active={doc.layers[selLayer].introOnly}
                    onPress={() =>
                      setDoc((d) => {
                        const layers = d.layers.slice();
                        layers[selLayer] = {
                          ...layers[selLayer],
                          introOnly: !layers[selLayer].introOnly,
                        };
                        return { ...d, layers };
                      })
                    }
                  />
                </View>
              </>
            ) : null}
            <View style={{ height: 16 }} />
            <Label>Kullanıcı adı filigranı</Label>
            <TextInput
              value={doc.handle}
              onChangeText={(v) => patch({ handle: v })}
              placeholder="@kullaniciadi"
              placeholderTextColor={C.dim}
              autoCapitalize="none"
              style={st.field}
              maxLength={30}
            />
          </>
        )}

        {tab === 'export' && (
          <>
            <View style={st.summary}>
              <Text style={st.summaryText}>Süre {total.toFixed(1)} sn</Text>
              <Text style={st.summaryText}>Kare {doc.clips.length}</Text>
              <Text style={st.summaryText}>Oran {doc.ratio}</Text>
              <Text style={st.summaryText}>
                {RATIOS[doc.ratio].w}×{RATIOS[doc.ratio].h}
              </Text>
            </View>
            <View style={{ height: 16 }} />
            <Btn
              label={busy ? `Oluşturuluyor… %${Math.round(progress * 100)}` : 'Videoyu oluştur'}
              primary
              wide
              disabled={busy || !doc.clips.length}
              onPress={doExport}
            />
            {!isExportAvailable() ? (
              <Text style={st.hint}>
                Expo Go’da video oluşturma çalışmaz (özel native kod gerekir). Önizleme ve tüm
                düzenleme çalışır. Video için development build al — adımlar README’de.
              </Text>
            ) : null}
            {lastVideo ? (
              <>
                <View style={{ height: 12 }} />
                <Btn label="Fotoğraflar’a kaydet" wide onPress={saveToPhotos} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* sekmeler */}
      <View style={[st.tabs, { paddingBottom: insets.bottom }]}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
            onPress={() => setTab(t.id)}
            style={[st.tab, tab === t.id && { borderTopColor: C.hot }]}>
            <Text style={[st.tabText, tab === t.id && { color: C.text }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* kare ayarları */}
      <Modal visible={sheetClip >= 0} transparent animationType="slide" onRequestClose={() => setSheetClip(-1)}>
        <Pressable style={st.sheetBg} onPress={() => setSheetClip(-1)} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 18 }]}>
          {sheetClip >= 0 && doc.clips[sheetClip] ? (
            <ScrollView>
              <Text style={st.sheetTitle}>Kare {sheetClip + 1}</Text>
              <Label right={`${doc.clips[sheetClip].beats} vuruş`}>Süre</Label>
              <Slider
                label="Kare süresi"
                value={doc.clips[sheetClip].beats}
                min={1}
                max={8}
                onChange={(v) => patchClip(sheetClip, { beats: v })}
              />
              <Label right={`%${Math.round(doc.clips[sheetClip].zoom * 100)}`}>Yakınlaştır</Label>
              <Slider
                label="Yakınlaştırma"
                value={Math.round(doc.clips[sheetClip].zoom * 100)}
                min={100}
                max={260}
                onChange={(v) => patchClip(sheetClip, { zoom: v / 100 })}
              />
              <Label>Kadraj</Label>
              <Slider
                label="Yatay kadraj"
                value={Math.round(doc.clips[sheetClip].ox * 100)}
                min={-100}
                max={100}
                onChange={(v) => patchClip(sheetClip, { ox: v / 100 })}
              />
              <Slider
                label="Dikey kadraj"
                value={Math.round(doc.clips[sheetClip].oy * 100)}
                min={-100}
                max={100}
                onChange={(v) => patchClip(sheetClip, { oy: v / 100 })}
              />
              <View style={{ height: 12 }} />
              <View style={st.row}>
                <Btn
                  label="Döndür 90°"
                  onPress={() => {
                    pushUndo();
                    patchClip(sheetClip, { rot: (((doc.clips[sheetClip].rot + 90) % 360) + 360) % 360 });
                  }}
                />
                <Btn
                  label="Çoğalt"
                  onPress={() => {
                    pushUndo();
                    setDoc((d) => {
                      const clips = d.clips.slice();
                      clips.splice(sheetClip + 1, 0, { ...clips[sheetClip], id: uid() });
                      return { ...d, clips };
                    });
                    setSheetClip(-1);
                  }}
                />
                <Btn
                  label="Sil"
                  tone="danger"
                  onPress={() => {
                    pushUndo();
                    setDoc((d) => ({ ...d, clips: d.clips.filter((_, i) => i !== sheetClip) }));
                    clock.value = 0;
                    setSheetClip(-1);
                  }}
                />
              </View>
              <View style={{ height: 14 }} />
              <Btn label="Tamam" primary wide onPress={() => setSheetClip(-1)} />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function indexAtJS(times: { start: number; dur: number }[], t: number): number {
  if (!times.length) return -1;
  const total = times[times.length - 1].start + times[times.length - 1].dur;
  const tt = total > 0 ? ((t % total) + total) % total : 0;
  let idx = 0;
  for (let i = 0; i < times.length; i++) if (tt >= times[i].start - 1e-6) idx = i;
  return idx;
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  ico: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  icoText: { color: C.muted, fontSize: 18, lineHeight: 20 },
  nameInput: { flex: 1, color: C.text, fontSize: 14.5, fontWeight: '700', paddingHorizontal: 4 },
  ratios: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  ratioBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  ratioOn: { backgroundColor: C.surface3 },
  ratioText: { color: C.muted, fontSize: 10, fontFamily: 'Menlo' },

  stageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  emptyStage: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  emptyText: { color: C.muted, textAlign: 'center' },

  tlWrap: { paddingHorizontal: 16, paddingBottom: 6 },
  timeline: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  tlClip: { flexBasis: 0, minWidth: 2, borderWidth: 2, borderRadius: 2, overflow: 'hidden' },
  tlNum: {
    position: 'absolute',
    top: 2,
    left: 3,
    color: '#fff',
    fontSize: 8,
    fontFamily: 'Menlo',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 3,
    borderRadius: 3,
  },
  tlEmpty: { color: C.dim, fontSize: 11.5, alignSelf: 'center', marginLeft: 12 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },

  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.hot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: '#14040A', fontSize: 14, fontWeight: '700' },
  time: { color: C.muted, fontFamily: 'Menlo', fontSize: 11 },
  status: { color: C.ok, fontSize: 11, marginLeft: 'auto' },

  panel: {
    maxHeight: '42%',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  hint: { color: C.dim, fontSize: 11.5, marginTop: 8, lineHeight: 17 },

  strip: { flexDirection: 'row', gap: 8 },
  thumb: {
    width: 58,
    height: 82,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  thumbNum: {
    position: 'absolute',
    top: 3,
    left: 3,
    color: '#fff',
    fontSize: 8.5,
    fontFamily: 'Menlo',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  thumbDur: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    color: '#fff',
    fontSize: 8,
    fontFamily: 'Menlo',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  addTile: {
    width: 58,
    height: 82,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  field: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontSize: 14,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 9,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
    marginBottom: 6,
  },

  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  summaryText: { color: C.muted, fontFamily: 'Menlo', fontSize: 11 },

  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.ink },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderTopWidth: 2, borderTopColor: 'transparent' },
  tabText: { color: C.dim, fontSize: 10.5, fontWeight: '700' },

  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: '75%',
  },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
});
