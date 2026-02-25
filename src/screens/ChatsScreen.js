import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getContacts } from "../services/chat";
import { api } from "../services/api";
import { getToken } from "../services/auth";

export default function ChatsScreen({ onOpenChat, onBack }) {
  const [contacts, setContacts] = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);

  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const aliveRef = useRef(true);
  const timeoutRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  async function loadContacts({ silent = false } = {}) {
    try {
      const res = await getContacts();
      if (!res?.success) throw new Error(res?.message || "Kişiler yüklenemedi");
      setContacts(res.contacts || []);
      setUnreadTotal(res.unread_count || 0);
    } catch (e) {
      if (!silent) {
        Alert.alert("Hata", e?.response?.data?.message || e.message || "Hata");
      }
    }
  }

  async function loadAllUsers() {
    setLoadingUsers(true);
    try {
      const token = await getToken();
      const res = await api.get("/api/chat/get-all-users.php", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Kullanıcılar yüklenemedi");
      }

      setUsers(res.data.users || []);
    } catch (e) {
      setUsers([]);
      Alert.alert(
        "Hata",
        e?.response?.data?.message || e.message || "Kullanıcılar yüklenemedi"
      );
    } finally {
      setLoadingUsers(false);
    }
  }

  // İlk açılış
  useEffect(() => {
    loadContacts();
  }, []);

  // Yeni sohbet modalı açılınca kullanıcıları çek
  useEffect(() => {
    if (showNewChat) {
      setQ("");
      loadAllUsers();
    }
  }, [showNewChat]);

  // ✅ Otomatik yenileme (Task sayfasındaki gibi)
  useEffect(() => {
    aliveRef.current = true;

    const tick = async () => {
      if (!aliveRef.current) return;

      // Uygulama arka plandaysa dur
      if (appStateRef.current !== "active") {
        timeoutRef.current = setTimeout(tick, 2000);
        return;
      }

      // Modal açıkken istersen refresh durdur (istersen kaldırabilirsin)
      if (showNewChat) {
        timeoutRef.current = setTimeout(tick, 2000);
        return;
      }

      await loadContacts({ silent: true });
      timeoutRef.current = setTimeout(tick, 5000); // 5 saniye
    };

    tick();

    return () => {
      aliveRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [showNewChat]);

  // ✅ AppState: arka plan/ön plan kontrolü
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;

      // Öne gelince anında bir yenile
      if (nextState === "active") {
        loadContacts({ silent: true });
      }
    });

    return () => sub.remove();
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;

    return users.filter((u) => {
      const name = String(u.full_name || "").toLowerCase();
      const username = String(u.username || "").toLowerCase();
      const role = String(u.role_name || "").toLowerCase();
      const dept = String(u.department_name || "").toLowerCase();
      return (
        name.includes(needle) ||
        username.includes(needle) ||
        role.includes(needle) ||
        dept.includes(needle)
      );
    });
  }, [users, q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={styles.hitSlop}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Sohbetler</Text>
          <View style={styles.subRow}>
            {unreadTotal ? (
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>{unreadTotal}</Text>
              </View>
            ) : null}
            <Text style={styles.subtitle}>
              {unreadTotal ? "okunmamış mesaj" : "tüm konuşmalar"}
            </Text>
          </View>
        </View>

        <Pressable onPress={() => loadContacts()} style={styles.refreshBtn} hitSlop={styles.hitSlop}>
          <Text style={styles.refreshText}>Yenile</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        data={contacts}
        keyExtractor={(item) => String(item.contact_id)}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
            ]}
            onPress={() => onOpenChat?.(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name || item.username}
              </Text>
              <Text style={styles.last} numberOfLines={1}>
                {item.last_message || "—"}
              </Text>
            </View>

            {!!Number(item.unread_count) && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread_count}</Text>
              </View>
            )}
          </Pressable>
        )}
      />

      {/* Floating + */}
      <Pressable
        onPress={() => setShowNewChat(true)}
        style={({ pressed }) => [
          styles.fab,
          pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
        ]}
        hitSlop={styles.hitSlop}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* New Chat Modal */}
      <Modal
        visible={showNewChat}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewChat(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalGrabber} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Sohbet</Text>
              <Pressable
                onPress={() => setShowNewChat(false)}
                style={styles.closeBtn}
                hitSlop={styles.hitSlop}
              >
                <Text style={styles.closeText}>Kapat</Text>
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Kişi ara..."
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={{ marginTop: 12 }}>
              {filteredUsers.map((u) => (
                <Pressable
                  key={String(u.id)}
                  onPress={() => {
                    setShowNewChat(false);
                    onOpenChat?.({
                      contact_id: u.id,
                      id: u.id,
                      full_name: u.full_name,
                      username: u.username,
                    });
                  }}
                  style={styles.userRow}
                >
                  <Text style={styles.userName}>{u.full_name}</Text>
                  <Text style={styles.userMeta}>@{u.username}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },

  backText: { fontWeight: "900", fontSize: 18 },

  title: { fontWeight: "900", fontSize: 18 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  subtitle: { color: "#64748B", fontWeight: "800", fontSize: 12 },

  totalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#0F172A",
  },
  totalBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  refreshBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    marginRight: 2,
  },
  refreshText: { color: "#fff", fontWeight: "900" },

  row: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    flexDirection: "row",
    alignItems: "center",
  },

  name: { fontWeight: "900" },
  last: { color: "#64748B", marginTop: 4 },

  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  fab: {
    position: "absolute",
    right: 22,
    bottom: 30,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  fabText: { color: "#fff", fontWeight: "900", fontSize: 24 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },

  modalCard: {
    maxHeight: "85%",
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
  },

  modalTitle: { fontWeight: "900", fontSize: 16 },

  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#0F172A",
  },
  closeText: { color: "#fff", fontWeight: "900" },

  searchBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  searchInput: { fontWeight: "800" },

  userRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  userName: { fontWeight: "900" },
  userMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },

  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
});