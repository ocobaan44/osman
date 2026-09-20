import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../theme';
import type { Clip, Doc, TextLayer } from '../types';
import {
  clipTimes,
  flashAlphaAt,
  layerStateAt,
  panOffset,
  templateById,
  textStateAt,
  totalDuration,
} from '../engine';

type PanTarget = { kind: 'clip'; index: number } | { kind: 'text'; index: number } | null;

type Props = {
  doc: Doc;
  clock: SharedValue<number>;
  width: number;
  height: number;
  /** Sürükleme hangi nesneyi hareket ettirsin */
  panTarget: PanTarget;
  onPan?: (dxRatio: number, dyRatio: number) => void;
  onPanEnd?: () => void;
};

const FILM_INSET = 0.055;

export default function ReelStage({
  doc,
  clock,
  width,
  height,
  panTarget,
  onPan,
  onPanEnd,
}: Props) {
  const tpl = templateById(doc.template);
  const times = useMemo(
    () => clipTimes(doc.clips, doc.bpm, doc.beatsPerClip),
    [doc.clips, doc.bpm, doc.beatsPerClip]
  );
  const total = useMemo(() => totalDuration(doc), [doc]);

  const isFilm = doc.template === 'film';
  const inset = isFilm ? Math.round(width * FILM_INSET) : 0;
  const box = {
    w: width - inset * 2,
    h: isFilm ? height - inset - Math.round(width * 0.16) : height,
    x: inset,
    y: inset,
  };

  const pan = Gesture.Pan()
    .enabled(!!panTarget && !!onPan)
    .minDistance(2)
    .onUpdate((e) => {
      if (onPan) runOnJS(onPan)(e.translationX / width, e.translationY / height);
    })
    .onFinalize(() => {
      if (onPanEnd) runOnJS(onPanEnd)();
    });

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashAlphaAt(clock.value, times, tpl),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[
          styles.stage,
          { width, height, backgroundColor: isFilm ? '#F4F1E9' : '#000' },
        ]}>
        <View
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            overflow: 'hidden',
            borderRadius: isFilm ? 4 : 0,
            backgroundColor: '#000',
          }}>
          {doc.clips.map((clip, i) => (
            <ClipLayer
              key={clip.id}
              clip={clip}
              index={i}
              clock={clock}
              times={times}
              tpl={tpl}
              boxW={box.w}
              boxH={box.h}
              bpm={doc.bpm}
            />
          ))}

          {doc.filter !== 'none' ? <FilterOverlay filter={doc.filter} /> : null}

          {doc.vignette && !isFilm ? <Vignette /> : null}

          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]}
          />
        </View>

        {doc.layers.map((layer) => (
          <TextLayerView
            key={layer.id}
            layer={layer}
            clock={clock}
            width={width}
            height={height}
            total={total}
            bpm={doc.bpm}
          />
        ))}

        {doc.handle.trim() ? (
          <Text
            pointerEvents="none"
            numberOfLines={1}
            style={[
              styles.handle,
              { fontSize: width * 0.034, left: width * 0.05, bottom: height * 0.03 },
            ]}>
            {doc.handle.trim().startsWith('@') ? doc.handle.trim() : '@' + doc.handle.trim()}
          </Text>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function ClipLayer({
  clip,
  index,
  clock,
  times,
  tpl,
  boxW,
  boxH,
  bpm,
}: {
  clip: Clip;
  index: number;
  clock: SharedValue<number>;
  times: { start: number; dur: number }[];
  tpl: ReturnType<typeof templateById>;
  boxW: number;
  boxH: number;
  bpm: number;
}) {
  const swap = clip.rot === 90 || clip.rot === 270;
  // Görselin kendi ekseninde kutuyu kaplayacak ölçüsü
  const fitW = swap ? boxH : boxW;
  const fitH = swap ? boxW : boxH;
  const cover = Math.max(fitW / clip.w, fitH / clip.h) * clip.zoom;
  const imgW = clip.w * cover;
  const imgH = clip.h * cover;
  const offset = panOffset(clip, boxW, boxH, 1);

  const animated = useAnimatedStyle(() => {
    const st = layerStateAt(index, clock.value, times, tpl, boxW, bpm);
    return {
      opacity: st.opacity,
      transform: [
        { translateX: st.translateX },
        { translateY: st.translateY },
        { scale: st.scale },
        { rotateZ: `${st.rotate}rad` },
      ],
    };
  }, [index, times, tpl, boxW, bpm]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, animated]}>
      <Image
        source={{ uri: clip.uri }}
        style={{
          position: 'absolute',
          width: imgW,
          height: imgH,
          left: (boxW - imgW) / 2 + offset.x,
          top: (boxH - imgH) / 2 + offset.y,
          transform: clip.rot ? [{ rotateZ: `${clip.rot}deg` }] : undefined,
        }}
      />
    </Animated.View>
  );
}

/** Kenar karartma — RN'de radyal gradyan yok, üst/alt gradyanlarla yapılır */
function Vignette() {
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={[StyleSheet.absoluteFill, { bottom: '65%' }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
        style={[StyleSheet.absoluteFill, { top: '55%' }]}
      />
    </>
  );
}

/**
 * Renk filtresi. RN'de CSS filtresi yok; karışım kipiyle yaklaşık bir sonuç
 * üretilir. Dışa aktarılan videoda filtre Core Image ile birebir uygulanır.
 */
function FilterOverlay({ filter }: { filter: string }) {
  const map: Record<string, { color: string; blend: any; opacity: number }> = {
    vivid: { color: '#FF6A3D', blend: 'saturation', opacity: 0.35 },
    warm: { color: '#FF9A3D', blend: 'overlay', opacity: 0.22 },
    cool: { color: '#3D8BFF', blend: 'overlay', opacity: 0.22 },
    mono: { color: '#8A8A8A', blend: 'color', opacity: 1 },
    film: { color: '#E8C89A', blend: 'soft-light', opacity: 0.45 },
    vhs: { color: '#FF3D74', blend: 'overlay', opacity: 0.3 },
  };
  const cfg = map[filter];
  if (!cfg) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: cfg.color, opacity: cfg.opacity, mixBlendMode: cfg.blend },
      ]}
    />
  );
}

function TextLayerView({
  layer,
  clock,
  width,
  height,
  total,
  bpm,
}: {
  layer: TextLayer;
  clock: SharedValue<number>;
  width: number;
  height: number;
  total: number;
  bpm: number;
}) {
  const unit = width / 100;
  const scale = layer.size / 100;

  const animated = useAnimatedStyle(() => {
    const st = textStateAt(clock.value, total, bpm, layer.introOnly);
    return {
      opacity: st.opacity,
      transform: [{ translateY: st.rise * height }, { scale: st.scale }],
    };
  }, [total, bpm, layer.introOnly, height]);

  const text = layer.text.trim();
  if (!text) return null;

  const common = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
  };

  let body: React.ReactNode;
  if (layer.style === 'tape') {
    const size = unit * 7 * scale;
    body = (
      <View style={[styles.tape, { paddingHorizontal: unit * 3.5, paddingVertical: size * 0.28 }]}>
        <Text style={{ fontSize: size, fontWeight: '700', color: '#1A0509' }}>
          {text.toUpperCase()}
        </Text>
      </View>
    );
  } else if (layer.style === 'caption') {
    const size = unit * 5.4 * scale;
    body = (
      <View style={[styles.caption, { paddingHorizontal: unit * 2.5, paddingVertical: size * 0.22 }]}>
        <Text style={{ fontSize: size, fontWeight: '500', color: '#fff' }}>{text}</Text>
      </View>
    );
  } else if (layer.style === 'ticker') {
    const size = unit * 4.4 * scale;
    body = (
      <View style={[styles.ticker, { paddingVertical: size * 0.8, width }]}>
        <View style={[styles.tickerRule, { height: unit * 0.35 }]} />
        <Text
          numberOfLines={1}
          style={{ fontSize: size, color: '#fff', fontFamily: 'Menlo', letterSpacing: size * 0.22 }}>
          {text.toUpperCase().slice(0, 34)}
        </Text>
      </View>
    );
  } else {
    const size = unit * 9.5 * scale;
    body = (
      <Text
        style={{
          fontSize: size,
          fontWeight: '900',
          color: '#fff',
          textAlign: 'center',
          maxWidth: width * 0.86,
          textShadowColor: 'rgba(0,0,0,0.55)',
          textShadowRadius: unit * 2.4,
          textShadowOffset: { width: 0, height: unit * 0.4 },
        }}>
        {text.toUpperCase()}
      </Text>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        common,
        { top: height * layer.yf - unit * 8, marginLeft: (layer.xf - 0.5) * width },
        animated,
      ]}>
      {body}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden', borderRadius: 14 },
  tape: { borderRadius: 999, backgroundColor: C.hot, overflow: 'hidden' },
  caption: { borderRadius: 10, backgroundColor: 'rgba(6,6,10,0.62)' },
  ticker: { backgroundColor: 'rgba(6,6,10,0.55)', alignItems: 'center' },
  tickerRule: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.amber },
  handle: {
    position: 'absolute',
    color: '#fff',
    opacity: 0.82,
    fontFamily: 'Menlo',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
});
