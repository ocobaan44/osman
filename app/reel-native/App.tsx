import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { C } from './src/theme';
import type { Project } from './src/types';
import {
  blankDoc,
  deleteProject as removeProject,
  loadProjects,
  uid,
  upsertProject,
  writeProjects,
} from './src/store';
import LibraryScreen from './src/screens/LibraryScreen';
import EditorScreen from './src/screens/EditorScreen';

export default function App() {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects()
      .then(setProjects)
      .finally(() => setReady(true));
  }, []);

  const create = useCallback(async () => {
    const p: Project = {
      id: uid(),
      name: `Reel ${projects.length + 1}`,
      updated: Date.now(),
      dur: 0,
      doc: blankDoc(),
    };
    setProjects(await upsertProject(p));
    setOpenId(p.id);
  }, [projects.length]);

  const change = useCallback((p: Project) => {
    setProjects((list) => {
      const next = list.some((x) => x.id === p.id)
        ? list.map((x) => (x.id === p.id ? p : x))
        : [p, ...list];
      const sorted = [...next].sort((a, b) => (b.updated || 0) - (a.updated || 0));
      writeProjects(sorted);
      return sorted;
    });
  }, []);

  const rename = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      Alert.prompt?.(
        'Proje adı',
        undefined,
        (text?: string) => {
          if (text == null) return;
          change({ ...p, name: text.trim() || p.name, updated: Date.now() });
        },
        'plain-text',
        p.name
      );
    },
    [projects, change]
  );

  const duplicate = useCallback(
    async (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      const copy: Project = {
        ...p,
        id: uid(),
        name: `${p.name} kopya`,
        updated: Date.now(),
        doc: JSON.parse(JSON.stringify(p.doc)),
      };
      setProjects(await upsertProject(copy));
    },
    [projects]
  );

  const destroy = useCallback((id: string) => {
    const p = projects.find((x) => x.id === id);
    Alert.alert(`"${p?.name ?? 'Proje'}" silinsin mi?`, 'Bu geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => setProjects(await removeProject(id)),
      },
    ]);
  }, [projects]);

  const current = openId ? projects.find((p) => p.id === openId) ?? null : null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={s.root}>
        <StatusBar barStyle="light-content" />
        {!ready ? (
          <View style={s.splash}>
            <Text style={s.splashText}>Reel Atölyesi</Text>
          </View>
        ) : current ? (
          <EditorScreen
            key={current.id}
            project={current}
            onChange={change}
            onBack={() => setOpenId(null)}
          />
        ) : (
          <LibraryScreen
            projects={projects}
            onOpen={setOpenId}
            onCreate={create}
            onRename={rename}
            onDuplicate={duplicate}
            onDelete={destroy}
          />
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink },
  splashText: { color: C.hot, fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
});
