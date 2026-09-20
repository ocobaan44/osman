import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import type { Project } from '../types';

function fmtDate(ts: number) {
  const d = new Date(ts);
  const n = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  if (d.toDateString() === n.toDateString()) return `Bugün ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export default function LibraryScreen({
  projects,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: {
  projects: Project[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();

  const menu = (p: Project) => {
    Alert.alert(p.name || 'Adsız', undefined, [
      { text: 'Aç', onPress: () => onOpen(p.id) },
      { text: 'Yeniden adlandır', onPress: () => onRename(p.id) },
      { text: 'Kopyasını oluştur', onPress: () => onDuplicate(p.id) },
      { text: 'Sil', style: 'destructive', onPress: () => onDelete(p.id) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.head}>
        <Text style={s.title}>Reel Atölyesi</Text>
        <Text style={s.sub}>{projects.length ? `${projects.length} proje` : 'Projelerin'}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={onCreate}>
          <LinearGradient
            colors={[C.hot, C.amber]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.newBtn}>
            <Text style={s.newBtnText}>+   Yeni reel oluştur</Text>
          </LinearGradient>
        </Pressable>

        {projects.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Henüz proje yok</Text>
            <Text style={s.emptyText}>Yukarıdan yeni bir reel oluştur.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {projects.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name} projesini aç`}
                onPress={() => onOpen(p.id)}
                onLongPress={() => menu(p)}
                style={s.card}>
                <View style={s.cover}>
                  {p.cover ? (
                    <Image source={{ uri: p.cover }} style={StyleSheet.absoluteFill} />
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name} seçenekleri`}
                  hitSlop={8}
                  onPress={() => menu(p)}
                  style={s.more}>
                  <Text style={s.moreText}>•••</Text>
                </Pressable>
                <View style={s.meta}>
                  <Text numberOfLines={1} style={s.cardName}>
                    {p.name || 'Adsız'}
                  </Text>
                  <Text style={s.cardMeta}>
                    {p.dur ? `${p.dur.toFixed(1)} sn · ` : ''}
                    {fmtDate(p.updated)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  title: { fontSize: 24, fontWeight: '800', color: C.hot, letterSpacing: -0.6 },
  sub: { fontSize: 12, color: C.dim, marginTop: 2 },

  newBtn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginBottom: 18 },
  newBtnText: { color: '#180509', fontWeight: '700', fontSize: 15 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    flexGrow: 1,
    maxWidth: '48.5%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  cover: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#101018' },
  more: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,14,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  moreText: { color: '#fff', fontSize: 11, lineHeight: 12 },
  meta: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 11 },
  cardName: { color: C.text, fontSize: 13, fontWeight: '700' },
  cardMeta: { color: C.dim, fontSize: 10, fontFamily: 'Menlo', marginTop: 3 },

  empty: {
    borderWidth: 1,
    borderColor: C.line,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 34,
    alignItems: 'center',
  },
  emptyTitle: { color: C.text, fontWeight: '700', marginBottom: 4 },
  emptyText: { color: C.muted, fontSize: 12.5 },
});
