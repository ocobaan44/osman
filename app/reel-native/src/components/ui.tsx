import React, { useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';

export function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{children}</Text>
      {right ? <Text style={s.labelRight}>{right}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[
        s.chip,
        active && s.chipActive,
        tone === 'danger' && { borderColor: '#42202A' },
      ]}>
      <Text
        style={[
          s.chipText,
          active && { color: C.text },
          tone === 'danger' && { color: C.bad },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Btn({
  label,
  onPress,
  primary,
  wide,
  disabled,
  tone,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  wide?: boolean;
  disabled?: boolean;
  tone?: 'danger';
}) {
  const body = (
    <Text
      style={[
        s.btnText,
        primary && { color: '#170509' },
        tone === 'danger' && { color: C.bad },
        disabled && { opacity: 0.5 },
      ]}>
      {label}
    </Text>
  );
  if (primary) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        style={[wide && { width: '100%' }, disabled && { opacity: 0.5 }]}>
        <LinearGradient
          colors={[C.hot, C.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.btn, { borderColor: 'transparent' }, wide && { width: '100%' }]}>
          {body}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.btn, s.btnPlain, wide && { width: '100%' }, disabled && { opacity: 0.5 }]}>
      {body}
    </Pressable>
  );
}

/** Dokunmatik kaydırıcı — @react-native-community/slider'a bağımlılık olmadan */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  label,
  style,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  label?: string;
  style?: ViewStyle;
}) {
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const pct = max > min ? (value - min) / (max - min) : 0;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const nw = e.nativeEvent.layout.width;
    setWidth(nw);
    w.value = nw;
  }, [w]);

  const emit = useCallback(
    (ratio: number) => {
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      const next = Math.max(min, Math.min(max, snapped));
      if (next !== value) onChange(next);
    },
    [min, max, step, onChange, value]
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      if (w.value > 0) runOnJS(emit)(Math.max(0, Math.min(1, e.x / w.value)));
    })
    .onUpdate((e) => {
      if (w.value > 0) runOnJS(emit)(Math.max(0, Math.min(1, e.x / w.value)));
    })
    .onFinalize(() => {
      if (onCommit) runOnJS(onCommit)();
    });

  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }));

  return (
    <View style={[{ flex: 1 }, style]}>
      <GestureDetector gesture={pan}>
        <View
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value }}
          style={s.sliderHit}>
          <View style={s.sliderTrack}>
            <Animated.View style={[s.sliderFill, fillStyle]} />
          </View>
          <View
            style={[
              s.sliderThumb,
              { left: Math.max(0, Math.min(1, pct)) * Math.max(0, width - 18) },
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

export const s = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  label: {
    fontFamily: 'Menlo',
    fontSize: 9.5,
    letterSpacing: 1,
    color: C.dim,
    textTransform: 'uppercase',
  },
  labelRight: { marginLeft: 'auto', fontFamily: 'Menlo', fontSize: 10.5, color: C.muted },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  chipActive: { backgroundColor: '#2A1B24', borderColor: C.hot },
  chipText: { color: C.muted, fontSize: 12.5, fontWeight: '500' },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPlain: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  btnText: { color: C.text, fontSize: 13, fontWeight: '700' },

  sliderHit: { height: 34, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: C.surface3, overflow: 'hidden' },
  sliderFill: { height: 4, backgroundColor: C.hot },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.text,
    top: 8,
  },
});
