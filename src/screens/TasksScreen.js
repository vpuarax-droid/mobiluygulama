import React, { useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ChatsScreen from "./ChatsScreen";
import ChatRoomScreen from "./ChatRoomScreen";
import { onUnauthorized } from "../services/authEvents";
import LoginScreen from "./LoginScreen";

import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  SectionList,
  Platform,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import { api } from "../services/api";
import { getToken } from "../services/auth";

// ✅ Push click listener
import { addPushResponseListener } from "../services/pushNotifications";

// UI components (refactor only; behavior unchanged)
import TaskSectionHeader from "../components/TaskSectionHeader";
import TaskCard from "../components/TaskCard";
import TaskCreateModal from "../components/TaskCreateModal";
import TaskDetailModal from "../components/TaskDetailModal";

const COLUMNS = [
  { key: "OPENED", title: "Görev Açıldı" },
  { key: "IN_PROGRESS", title: "Üstünde Çalışılıyor" },
  { key: "REVIEW", title: "Kontrol Ediliyor" },
  { key: "COMPLETED", title: "Tamamlandı" },
  { key: "CANCELLED", title: "İptal Edildi" },
];

const DEMO_TASKS = [
  {
    id: 1,
    title: "Demo görev",
    description: "Detay modalını test etmek için örnek açıklama.",
    status_code: "OPENED",
    priority: "HIGH",
    created_at: "2026-02-11 12:00:00",
  },
];

function accentForStatus(status) {
  switch (status) {
    case "OPENED":
      return "#1D4ED8";
    case "IN_PROGRESS":
      return "#2563EB";
    case "REVIEW":
      return "#3B82F6";
    case "COMPLETED":
      return "#22C55E";
    case "CANCELLED":
      return "#EF4444";
    default:
      return "#64748B";
  }
}

function formatPriority(p) {
  if (!p) return null;
  const key = String(p).toUpperCase();
  if (key === "HIGH") return "Yüksek";
  if (key === "MEDIUM") return "Orta";
  if (key === "LOW") return "Düşük";
  if (key === "URGENT") return "Acil";
  return p;
}

// Backend: createTask default 'medium' vs bazı yerlerde 'HIGH' vs geliyor
function normalizePriorityForBackend(p) {
  if (!p) return "medium";
  const v = String(p).toLowerCase();
  if (v === "high" || v === "medium" || v === "low" || v === "urgent") return v;
  // legacy: HIGH/MEDIUM/LOW/URGENT
  const up = String(p).toUpperCase();
  if (up === "HIGH") return "high";
  if (up === "MEDIUM") return "medium";
  if (up === "LOW") return "low";
  if (up === "URGENT") return "urgent";
  return "medium";
}

function priorityLabel(p) {
  const v = normalizePriorityForBackend(p);
  if (v === "high") return "Yüksek";
  if (v === "medium") return "Orta";
  if (v === "low") return "Düşük";
  if (v === "urgent") return "Acil";
  return "Orta";
}

function guessMime(filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "ppt") return "application/vnd.ms-powerpoint";
  if (ext === "pptx")
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === "txt") return "text/plain";
  if (ext === "zip") return "application/zip";
  if (ext === "rar") return "application/vnd.rar";
  return "application/octet-stream";
}

async function fetchTaskDetail(taskId) {
  const token = await getToken();
  const res = await api.get(`/system/api/tasks.php?id=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res?.data;
}

async function addTaskComment(taskId, comment) {
  const token = await getToken();
  const res = await api.put(
    `/system/api/tasks.php?id=${encodeURIComponent(taskId)}&action=comment`,
    { comment },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res?.data;
}

async function addTaskStep(taskId, step_title) {
  const token = await getToken();
  const res = await api.post(
    `/system/api/tasks.php?action=add_step&task_id=${encodeURIComponent(taskId)}`,
    { step_title },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res?.data;
}

async function toggleTaskStep(stepId, is_completed) {
  const token = await getToken();
  const res = await api.put(
    `/system/api/tasks.php?action=update_step&step_id=${encodeURIComponent(stepId)}`,
    { is_completed: is_completed ? 1 : 0 },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res?.data;
}

async function deleteTaskStep(stepId) {
  const token = await getToken();
  const res = await api.delete(
    `/system/api/tasks.php?action=delete_step&step_id=${encodeURIComponent(stepId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res?.data;
}

async function fetchCreateTargets() {
  const token = await getToken();
  const res = await api.get("/system/api/tasks.php?action=create_targets", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res?.data;
}

/**
 * ✅ Create targets normalize + uniq
 * - Backend normalde: { success:true, targets:[...] }
 * - Ama bazen yanlışlıkla tasks/departments gibi key ile dönerse fallback
 * - Aynı departmanı birden fazla basma sorununu id bazlı tekilleştirir
 */
function uniqById(list) {
  const m = new Map();
  for (const d of list || []) {
    const id = Number(d?.id ?? d?.department_id ?? d?.target_department_id ?? 0);
    const name = d?.department_name ?? d?.name ?? "";
    if (!id || !name) continue;
    if (!m.has(id)) m.set(id, { id, department_name: name });
  }
  return Array.from(m.values());
}

function pickTargetsFromResponse(res) {
  const raw =
    (res && Array.isArray(res.targets) && res.targets) ||
    (res && Array.isArray(res.departments) && res.departments) ||
    (res && Array.isArray(res.tasks) && res.tasks) ||
    [];
  return uniqById(raw);
}

/**
 * Dosya seç + upload
 */
async function uploadTaskFile(taskId) {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return { success: false, canceled: true };

  const f = result.assets?.[0];
  if (!f) throw new Error("Dosya seçilemedi");

  const name = f.name || `upload_${Date.now()}.bin`;
  const type = f.mimeType || guessMime(name);

  const token = await getToken();
  const form = new FormData();
  form.append("task_id", String(taskId));

  // ✅ WEB: gerçek File gönder
  if (Platform.OS === "web" && f.file) {
    form.append("file", f.file, name);
  } else {
    // ✅ NATIVE: uri ile gönder
    let uploadUri = f.uri;
    if (!uploadUri) throw new Error("Dosya URI yok");

    if (uploadUri.startsWith("content://")) {
      const dest = FileSystem.cacheDirectory + name;
      await FileSystem.copyAsync({ from: uploadUri, to: dest });
      uploadUri = dest;
    }

    form.append("file", { uri: uploadUri, name, type });
  }

  // ❗ Content-Type header'ını SET ETME!
  const resp = await fetch("https://efetosun.com/system/api/upload.php", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      // ❌ Content-Type YAZMA
    },
    body: form,
  });

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}\n` + JSON.stringify(json || {}, null, 2));
  }

  return json;
}

export default function TasksScreen({ onLoggedOut }) {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);

  const [suggested, setSuggested] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Chat navigation
  const [screen, setScreen] = useState("tasks"); // "tasks" | "chats" | "chatroom"
  const [activeChat, setActiveChat] = useState(null);

  const [authState, setAuthState] = useState("checking"); // checking | loggedIn | loggedOut

  // Detail
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Comment
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);

  // Steps
  const [newStep, setNewStep] = useState("");
  const [stepWorking, setStepWorking] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);

  // ✅ Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");

  // ✅ Create targets
  const [createTargets, setCreateTargets] = useState([]);
  const [selectedTargetDeptId, setSelectedTargetDeptId] = useState(null);
  const [loadingTargets, setLoadingTargets] = useState(false);

  const clearAuthStorage = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        "token",
        "auth_token",
        "access_token",
        "jwt",
        "user",
        "auth_user",
      ]);
    } catch (e) {
      // ignore
    }
  }, []);

  const forceLogout = useCallback(
    async (reason = "") => {
      await clearAuthStorage();
      setAuthState("loggedOut");
      onLoggedOut?.(); // ✅ App.js'e bildir

      setScreen("tasks");
      setActiveChat(null);
      setSelectedTask(null);

      if (reason) {
        Alert.alert("Oturum Kapandı", reason);
      }
    },
    [clearAuthStorage, onLoggedOut]
  );

  // ✅ Push'tan gelen task_id ile direkt modal açmak için
  async function openTaskById(taskId) {
    if (!taskId) return;

    setSelectedTask({ id: Number(taskId), title: `Task #${taskId}` });
    setDetail(null);
    setCommentText("");
    setNewStep("");

    try {
      setLoadingDetail(true);
      const res = await fetchTaskDetail(taskId);
      if (!res?.success) throw new Error(res?.message || "Detay alınamadı");
      setDetail(res.task);
    } catch (e) {
      Alert.alert("Hata", e?.message || "Detay alınamadı");
      setSelectedTask(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  // ✅ Push'tan gelen chat_id (contact_id gibi) ile chatroom açmak için
  async function openChatByContactId(contactId) {
    if (!contactId) return;

    try {
      const token = await getToken();

      // Not: Bu endpoint senin backend özetine göre var:
      // GET /api/chat/get-contacts.php
      const res = await api.get("/api/chat/get-contacts.php", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const list = res?.data?.contacts || res?.data?.data || res?.data || [];
      const found = (list || []).find(
        (c) => String(c.id ?? c.user_id ?? c.contact_id) === String(contactId)
      );

      if (found) {
        setActiveChat(found);
        setScreen("chatroom");
      } else {
        setScreen("chats");
        Alert.alert("Chat", "Kişi bulunamadı, chat listesi açıldı.");
      }
    } catch (e) {
      setScreen("chats");
      Alert.alert("Chat", "Chat listesi alınamadı.");
    }
  }

  // İlk açılışta token var mı kontrol et
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const t = await getToken();
        if (!mounted) return;
        setAuthState(t ? "loggedIn" : "loggedOut");
      } catch (e) {
        if (!mounted) return;
        setAuthState("loggedOut");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ Global auth event: api.js 401/403 yakalayınca buraya düşer
  useEffect(() => {
    const off = onUnauthorized((reason) => {
      forceLogout(reason || "Lütfen tekrar giriş yapın.");
    });

    return off;
  }, [forceLogout]);

  // ✅ Bildirime tıklanınca yönlendir (task/chat)
  useEffect(() => {
    const sub = addPushResponseListener((data) => {
      if (!data) return;

      if (data.type === "task" && data.task_id) {
        openTaskById(Number(data.task_id));
        return;
      }

      if (data.type === "chat" && data.chat_id) {
        openChatByContactId(Number(data.chat_id));
        return;
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchTasks() {
    try {
      const token = await getToken();
      const res = await api.get("/system/api/tasks.php", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const list = res?.data?.tasks || [];
      setTasks(list.length ? list : DEMO_TASKS);
    } catch (e) {
      console.log("TASKS ERR:", e?.response?.data || e.message);
      setTasks(DEMO_TASKS);
    }
  }

  async function openTask(task) {
    const taskId = task?.id ?? task?.task_id;
    setSelectedTask(task);
    setDetail(null);
    setCommentText("");
    setNewStep("");

    try {
      setLoadingDetail(true);
      const res = await fetchTaskDetail(taskId);
      if (!res?.success) throw new Error(res?.message || "Detay alınamadı");
      setDetail(res.task);
    } catch (e) {
      Alert.alert("Hata", e?.message || "Detay alınamadı");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function refreshDetail() {
    const taskId = selectedTask?.id ?? selectedTask?.task_id;
    if (!taskId) return;
    try {
      setLoadingDetail(true);
      const res = await fetchTaskDetail(taskId);
      if (!res?.success) throw new Error(res?.message || "Detay alınamadı");
      setDetail(res.task);
    } catch (e) {
      Alert.alert("Hata", e?.message || "Detay alınamadı");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function updateStatus(taskId, newStatus) {
    if (updating) return;
    setUpdating(true);

    const prevTasks = tasks;
    const prevSelected = selectedTask;

    setTasks((prev) =>
      prev.map((t) =>
        String(t.id ?? t.task_id) === String(taskId) ? { ...t, status_code: newStatus } : t
      )
    );
    setSelectedTask((prev) =>
      prev && String(prev.id ?? prev.task_id) === String(taskId)
        ? { ...prev, status_code: newStatus }
        : prev
    );

    try {
      const token = await getToken();
      const res = await api.put(
        `/system/api/tasks.php?id=${encodeURIComponent(taskId)}&action=status`,
        { status_code: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Durum güncellenemedi");
      }

      await fetchTasks();
      await refreshDetail();
    } catch (e) {
      setTasks(prevTasks);
      setSelectedTask(prevSelected);
      Alert.alert("Hata", e?.response?.data?.message || e.message || "Durum güncellenemedi");
    } finally {
      setUpdating(false);
    }
  }

  async function onSendComment() {
    const taskId = selectedTask?.id ?? selectedTask?.task_id;
    const txt = commentText.trim();
    if (!taskId || !txt || commentSending) return;

    try {
      setCommentSending(true);
      const res = await addTaskComment(taskId, txt);
      if (!res?.success) throw new Error(res?.message || "Yorum eklenemedi");
      setCommentText("");
      await refreshDetail();
    } catch (e) {
      Alert.alert("Hata", e?.message || "Yorum eklenemedi");
    } finally {
      setCommentSending(false);
    }
  }

  async function onAddStep() {
    const taskId = selectedTask?.id ?? selectedTask?.task_id;
    const txt = newStep.trim();
    if (!taskId || !txt || stepWorking) return;

    try {
      setStepWorking(true);
      const res = await addTaskStep(taskId, txt);
      if (!res?.success) throw new Error(res?.message || "Aşama eklenemedi");
      setNewStep("");
      await refreshDetail();
    } catch (e) {
      Alert.alert("Hata", e?.message || "Aşama eklenemedi");
    } finally {
      setStepWorking(false);
    }
  }

  async function onToggleStep(stepId, isCompleted) {
    if (stepWorking) return;
    try {
      setStepWorking(true);
      const res = await toggleTaskStep(stepId, isCompleted);
      if (!res?.success) throw new Error(res?.message || "Aşama güncellenemedi");
      await refreshDetail();
    } catch (e) {
      Alert.alert("Hata", e?.message || "Aşama güncellenemedi");
    } finally {
      setStepWorking(false);
    }
  }

  async function onDeleteStep(stepId) {
    if (stepWorking) return;
    Alert.alert("Sil", "Bu aşamayı silmek istiyor musun?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            setStepWorking(true);
            const res = await deleteTaskStep(stepId);
            if (!res?.success) throw new Error(res?.message || "Aşama silinemedi");
            await refreshDetail();
          } catch (e) {
            Alert.alert("Hata", e?.message || "Aşama silinemedi");
          } finally {
            setStepWorking(false);
          }
        },
      },
    ]);
  }

  async function onPickAndUpload() {
    const taskId = selectedTask?.id ?? selectedTask?.task_id;
    if (!taskId || uploading) return;

    try {
      setUploading(true);

      const res = await uploadTaskFile(taskId);
      if (res?.canceled) return;

      if (!res?.success) throw new Error(res?.message || "Dosya yüklenemedi");

      Alert.alert("Başarılı", "Dosya yüklendi");
      await refreshDetail();
    } catch (e) {
      console.log("UPLOAD ERR STATUS:", e?.response?.status);
      console.log("UPLOAD ERR DATA:", e?.response?.data);
      Alert.alert("Upload Hata", e?.message || "Dosya yüklenemedi");
    } finally {
      setUploading(false);
    }
  }

  // ✅ Güncellendi: targets/tasks/departments fallback + uniq + debug log
  async function openCreate() {
    setCreateVisible(true);
    setNewTitle("");
    setNewDesc("");
    setNewPriority("medium");
    setCreateTargets([]);
    setSelectedTargetDeptId(null);

    try {
      setLoadingTargets(true);

      const res = await fetchCreateTargets();
      console.log("CREATE TARGETS RAW:", res);

      const list = pickTargetsFromResponse(res);
      console.log("CREATE TARGETS NORMALIZED:", list);

      setCreateTargets(list);

      const firstId = list?.[0]?.id ? Number(list[0].id) : null;
      setSelectedTargetDeptId(firstId);
    } catch (e) {
      console.log("CREATE TARGETS ERROR:", e?.response?.data || e.message);
      Alert.alert("Hata", "Hedef birimler alınamadı");
    } finally {
      setLoadingTargets(false);
    }
  }

  async function onCreateTask() {
    const title = newTitle.trim();
    const description = newDesc.trim();

    if (!title) {
      Alert.alert("Eksik", "Görev başlığı gerekli");
      return;
    }

    if (!selectedTargetDeptId) {
      Alert.alert("Eksik", "Hedef birim seçilemedi");
      return;
    }

    if (creating) return;

    try {
      setCreating(true);
      const token = await getToken();

      const payload = {
        title,
        description: description || null,
        priority: normalizePriorityForBackend(newPriority),
        target_department_id: Number(selectedTargetDeptId),
      };

      const res = await api.post("/system/api/tasks.php", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Görev oluşturulamadı");
      }

      Alert.alert("Başarılı", "Görev oluşturuldu");
      setCreateVisible(false);
      await fetchTasks();
    } catch (e) {
      Alert.alert("Hata", e?.response?.data?.message || e.message || "Görev oluşturulamadı");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    let alive = true;
    let timeoutId = null;

    const loop = async () => {
      if (!alive) return;

      try {
        await fetchTasks();
      } catch (e) {}

      timeoutId = setTimeout(loop, 5000); // 5 saniyede bir yenile
    };

    loop();

    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const sections = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));
    for (const t of tasks) {
      const k = t.status_code || "OPENED";
      if (!map[k]) map[k] = [];
      map[k].push(t);
    }
    return COLUMNS.map((c) => ({
      key: c.key,
      title: c.title,
      data: map[c.key] || [],
    }));
  }, [tasks]);

  // Auth guard: token yoksa login ekranını göster
  if (authState !== "loggedIn") {
    return (
      <LoginScreen
        onLoggedIn={() => {
          setAuthState("loggedIn");
        }}
      />
    );
  }

  if (screen === "chats") {
    return (
      <ChatsScreen
        onBack={() => setScreen("tasks")}
        onOpenChat={(contact) => {
          setActiveChat(contact);
          setScreen("chatroom");
        }}
      />
    );
  }

  if (screen === "chatroom") {
    return <ChatRoomScreen contact={activeChat} onBack={() => setScreen("chats")} />;
  }

  const modalVisible = !!selectedTask;
  const taskId = selectedTask?.id ?? selectedTask?.task_id;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Görevler</Text>
          <View style={styles.subRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{tasks.length}</Text>
            </View>
            <Text style={styles.subtitle}>toplam görev</Text>
          </View>
        </View>

        <Pressable
          onPress={openCreate}
          style={({ pressed }) => [
            styles.createBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.createBtnText}>+ Yeni</Text>
        </Pressable>

        <Pressable
          onPress={() => setScreen("chats")}
          style={({ pressed }) => [
            styles.chatBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.chatBtnText}>Chat</Text>
        </Pressable>

        <Pressable
          onPress={fetchTasks}
          style={({ pressed }) => [
            styles.refreshBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.refreshText}>Yenile</Text>
        </Pressable>

        <Pressable
          onPress={() => forceLogout()}
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.logoutText}>Çıkış</Text>
        </Pressable>
      </View>

      {/* Kanban */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id ?? item.task_id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          const accent = accentForStatus(section.key);
          return (
            <TaskSectionHeader
              title={section.title}
              count={section.data.length}
              accent={accent}
              styles={styles}
            />
          );
        }}
        renderItem={({ item }) => {
          const pri = formatPriority(item.priority);
          const accent = accentForStatus(item.status_code);

          return (
            <TaskCard
              item={item}
              onPress={() => openTask(item)}
              accent={accent}
              priorityText={pri}
              styles={styles}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Boş</Text>
              <Text style={styles.emptySub}>Bu bölümde görev yok.</Text>
            </View>
          ) : (
            <View style={{ height: 16 }} />
          )
        }
      />

      <TaskCreateModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newDesc={newDesc}
        setNewDesc={setNewDesc}
        newPriority={newPriority}
        setNewPriority={setNewPriority}
        creating={creating}
        onCreateTask={onCreateTask}
        loadingTargets={loadingTargets}
        createTargets={createTargets}
        selectedTargetDeptId={selectedTargetDeptId}
        setSelectedTargetDeptId={setSelectedTargetDeptId}
        styles={styles}
        normalizePriorityForBackend={normalizePriorityForBackend}
        priorityLabel={priorityLabel}
      />

      <TaskDetailModal
        visible={modalVisible}
        onClose={() => {
          setSelectedTask(null);
          setDetail(null);
        }}
        selectedTask={selectedTask}
        taskId={taskId}
        detail={detail}
        loadingDetail={loadingDetail}
        columns={COLUMNS}
        updating={updating}
        accentForStatus={accentForStatus}
        updateStatus={updateStatus}
        newStep={newStep}
        setNewStep={setNewStep}
        stepWorking={stepWorking}
        onAddStep={onAddStep}
        onToggleStep={onToggleStep}
        onDeleteStep={onDeleteStep}
        uploading={uploading}
        onPickAndUpload={onPickAndUpload}
        commentText={commentText}
        setCommentText={setCommentText}
        commentSending={commentSending}
        onSendComment={onSendComment}
        styles={styles}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 12,
    paddingTop: Platform.select({ ios: 14, android: 12, default: 12 }),
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  subtitle: { color: "#64748B", fontWeight: "800", fontSize: 12 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#0F172A",
  },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  createBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#3160DE",
  },
  createBtnText: { color: "#fff", fontWeight: "900" },

  chatBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#3160DE",
  },
  chatBtnText: { color: "#fff", fontWeight: "900" },

  refreshBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#3160DE",
  },
  refreshText: { color: "#fff", fontWeight: "900" },

  logoutBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#db3030",
  },
  logoutText: { color: "#fff", fontWeight: "900" },

  sectionHeader: {
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 999 },
  sectionTitle: { fontWeight: "900", color: "#fff", flex: 1 },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#fff",
  },
  countBadgeText: { fontWeight: "900", color: "#0F172A", fontSize: 12 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
  },
  cardTitle: { fontWeight: "900", color: "#0F172A", marginBottom: 6 },
  cardDesc: { color: "#334155", fontWeight: "700", lineHeight: 18, marginBottom: 10 },

  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  idChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#0F172A",
  },
  idChipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  softChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  softChipText: { color: "#0F172A", fontWeight: "900", fontSize: 12 },
  smallDot: { width: 8, height: 8, borderRadius: 999 },

  emptyBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  emptyTitle: { fontWeight: "900", color: "#0F172A" },
  emptySub: { marginTop: 6, color: "#64748B", fontWeight: "800", lineHeight: 18 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.42)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 14,
  },
  modalGrabber: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  modalTitle: { fontWeight: "900", fontSize: 16, color: "#0F172A" },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#0F172A",
  },
  closeText: { color: "#fff", fontWeight: "900" },

  modalSection: { marginTop: 16 },
  modalSectionTitle: { fontWeight: "900", color: "#0F172A", marginBottom: 10 },

  inputRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 10 },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    color: "#0F172A",
    fontWeight: "800",
  },

  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  priorityPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  priorityText: { fontWeight: "900", color: "#0F172A" },

  createSubmit: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    alignItems: "center",
  },
  createSubmitText: { color: "#fff", fontWeight: "900" },

  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  statusPillText: { fontWeight: "900", color: "#0F172A" },
  pillDot: { width: 8, height: 8, borderRadius: 999 },

  muted: { marginTop: 6, color: "#64748B", fontWeight: "800" },

  detailTitle: { fontSize: 20, fontWeight: "900", color: "#0F172A", marginTop: 10 },
  descFull: { marginTop: 10, fontSize: 14, lineHeight: 20, color: "#334155", fontWeight: "700" },

  sendBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#0F172A" },
  sendBtnText: { color: "#fff", fontWeight: "900" },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: "#0F172A" },
  checkText: { fontWeight: "900", color: "#0F172A" },
  stepText: { flex: 1, fontWeight: "900", color: "#0F172A" },
  stepTextDone: { textDecorationLine: "line-through", color: "#64748B" },
  stepDelBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#FEE2E2" },
  stepDelText: { color: "#991B1B", fontWeight: "900" },

  uploadBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "#0F172A" },
  uploadBtnText: { color: "#fff", fontWeight: "900" },

  fileRow: { borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", borderRadius: 14, padding: 12 },
  fileName: { fontWeight: "900", color: "#0F172A" },
  fileMeta: { marginTop: 4, color: "#64748B", fontWeight: "800", fontSize: 12 },

  commentBox: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 12, backgroundColor: "#fff" },
  commentMeta: { color: "#64748B", fontWeight: "900", fontSize: 12 },
  commentText: { marginTop: 6, fontWeight: "800", color: "#0F172A" },
});
