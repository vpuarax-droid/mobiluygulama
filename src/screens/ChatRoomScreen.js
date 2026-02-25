import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getConversation } from "../services/chat";
import { api } from "../services/api";
import { getToken } from "../services/auth";

function formatTime(ts) {
  if (!ts) return "";
  const m = String(ts).match(/(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[1]}:${m[2]}`;
}

export default function ChatRoomScreen({ contact, onBack }) {
  const contactId = contact?.contact_id ?? contact?.id;
  const title =
    contact?.full_name ||
    contact?.username ||
    contact?.name ||
    `#${contactId}`;

  const [myUserId, setMyUserId] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef(null);

  async function loadMe() {
    try {
      setLoadingMe(true);
      const token = await getToken();
      const res = await api.get("/system/api/auth.php?action=me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res?.data?.success)
        throw new Error(res?.data?.message || "Kullanıcı bulunamadı");

      setMyUserId(String(res.data.user?.id));
    } catch (e) {
      setMyUserId(null);
    } finally {
      setLoadingMe(false);
    }
  }

  async function loadMessages({ scrollToEnd = false } = {}) {
    if (!contactId) return;
    try {
      setLoadingMsgs(true);
      const res = await getConversation(contactId, 200);
      if (!res?.success)
        throw new Error(res?.message || "Konuşma yüklenemedi");

      setMessages(res.messages || []);

      if (scrollToEnd) {
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, 60);
      }
    } catch (e) {
      Alert.alert("Hata", e?.message || "Konuşma yüklenemedi");
    } finally {
      setLoadingMsgs(false);
    }
  }

  useEffect(() => {
    if (!contactId) return;

    let alive = true;
    let timer = null;

    const tick = async (scrollToEnd = false) => {
      if (!alive) return;
      await loadMessages({ scrollToEnd });
    };

    const start = () => {
      if (timer) return;
      tick(true);
      timer = setInterval(() => tick(false), 2500);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    loadMe();
    start();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    return () => {
      alive = false;
      stop();
      sub?.remove?.();
    };
  }, [contactId]);

  const data = useMemo(() => {
    const arr = [...messages];
    arr.sort((a, b) =>
      String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );
    return arr;
  }, [messages]);

  /**
   * ✅ FINAL FIX: axios yerine fetch ile FormData gönder
   * - Expo/RN Android'de axios+FormData -> ERR_NETWORK çok sık olur
   */
  async function onSend() {
    const m = text.trim();
    if (!m || sending || !contactId) return;

    setText("");
    setSending(true);

    try {
      const token = await getToken();

      const form = new FormData();
      form.append("receiver_id", String(contactId));
      form.append("message", m);

      const url = "https://efetosun.com/api/chat/send.php";

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          // ❌ Content-Type yazma! fetch boundary'i kendi ekler
        },
        body: form,
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error(
          `HTTP ${resp.status}\n` + JSON.stringify(json || {}, null, 2)
        );
      }

      if (!json?.success) {
        throw new Error(json?.message || "Mesaj gönderilemedi");
      }

      await loadMessages({ scrollToEnd: true });
    } catch (e) {
      setText(m);

      const msg =
        "Mesaj gönderilemedi\n\n" +
        "message: " + (e?.message || "") + "\n";

      console.log("SEND ERROR FULL:", e);
      Alert.alert("Hata", msg);
    } finally {
      setSending(false);
    }
  }

  function renderItem({ item }) {
    const senderId = String(item?.sender_id);
    const mine = myUserId && senderId === myUserId;

    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
          ]}
        >
          {!mine && (
            <Text style={styles.senderName}>
              {item.sender_name || "Kullanıcı"}
            </Text>
          )}

          <Text style={styles.msgText}>{item.message}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>

            {mine &&
              (() => {
                const isRead =
                  String(item.is_read) === "1" ||
                  item.is_read === 1 ||
                  !!item.read_at;

                return (
                  <Text
                    style={[
                      styles.tick,
                      isRead ? styles.tickRead : styles.tickSent,
                    ]}
                  >
                    ✓✓
                  </Text>
                );
              })()}
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={styles.hitSlop}>
            <Text style={styles.backText}>←</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSub}>
              {loadingMe ? "Bağlanıyor..." : "Çevrimiçi"}
            </Text>
          </View>

          <Pressable
            onPress={() => loadMessages({ scrollToEnd: true })}
            style={styles.refreshBtn}
            hitSlop={styles.hitSlop}
          >
            <Text style={styles.refreshText}>⟳</Text>
          </Pressable>
        </View>

        {loadingMsgs && data.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Mesajlar yükleniyor...</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={data}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={styles.composerWrap}>
          <View style={styles.composer}>
            <Pressable style={styles.iconBtn} hitSlop={styles.hitSlop}>
              <Text style={styles.icon}>＋</Text>
            </Pressable>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Mesaj"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              multiline
            />

            <Pressable
              onPress={onSend}
              disabled={sending || !text.trim()}
              style={[
                styles.sendBtn,
                (sending || !text.trim()) && { opacity: 0.5 },
              ]}
              hitSlop={styles.hitSlop}
            >
              <Text style={styles.sendIcon}>➤</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },

  header: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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

  backText: { fontWeight: "900", fontSize: 18, color: "#0F172A" },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  headerSub: { fontSize: 12, color: "#64748B", marginTop: 2 },

  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    marginRight: 2,
  },
  refreshText: { fontWeight: "900", color: "#0F172A" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 8, color: "#64748B" },

  listContent: { padding: 12, paddingBottom: 12 },

  row: { flexDirection: "row", marginBottom: 8 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },

  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  bubbleOther: { backgroundColor: "#ffffff" },
  bubbleMine: { backgroundColor: "#F1F5F9" },

  senderName: {
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 4,
    color: "#0F172A",
  },

  msgText: {
    fontSize: 15,
    lineHeight: 20,
    color: "#0F172A",
  },

  metaRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },

  timeText: { fontSize: 11, color: "#64748B" },
  tick: { fontSize: 11 },
  tickSent: { color: "#94A3B8" },
  tickRead: { color: "#2563EB" },

  composerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#ffffff",
  },

  composer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  icon: { fontSize: 18, fontWeight: "900", color: "#0F172A" },

  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    fontSize: 15,
    color: "#0F172A",
  },

  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },

  sendIcon: { color: "#ffffff", fontWeight: "900", fontSize: 16 },

  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
});