import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

export default function TaskCreateModal({
  visible,
  onClose,
  newTitle,
  setNewTitle,
  newDesc,
  setNewDesc,
  newPriority,
  setNewPriority,
  creating,
  onCreateTask,
  loadingTargets,
  createTargets,
  selectedTargetDeptId,
  setSelectedTargetDeptId,
  styles,
  normalizePriorityForBackend,
  priorityLabel,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalGrabber} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Yeni Görev</Text>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Kapat</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Başlık</Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Görev başlığı..."
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Açıklama</Text>
              <TextInput
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Açıklama (opsiyonel)..."
                placeholderTextColor="#94A3B8"
                style={[styles.input, { minHeight: 90, paddingTop: 12 }]}
                multiline
              />
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Öncelik</Text>
              <View style={styles.priorityRow}>
                {["low", "medium", "high", "urgent"].map((p) => {
                  const active = normalizePriorityForBackend(newPriority) === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setNewPriority(p)}
                      style={[styles.priorityPill, active && { backgroundColor: "#0F172A" }]}
                    >
                      <Text style={[styles.priorityText, active && { color: "#fff" }]}> 
                        {priorityLabel(p)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Hedef</Text>

              {loadingTargets ? (
                <View style={{ paddingVertical: 12, alignItems: "center" }}>
                  <ActivityIndicator />
                  <Text style={{ marginTop: 8, color: "#64748B", fontWeight: "800" }}>
                    Yükleniyor...
                  </Text>
                </View>
              ) : (createTargets || []).length ? (
                <View style={styles.priorityRow}>
                  {(createTargets || [])
                    .filter((x) => x?.id && x?.department_name)
                    .map((d) => {
                      const active = Number(d.id) === Number(selectedTargetDeptId);
                      return (
                        <Pressable
                          key={String(d.id)}
                          onPress={() => setSelectedTargetDeptId(Number(d.id))}
                          style={[styles.priorityPill, active && { backgroundColor: "#0F172A" }]}
                        >
                          <Text style={[styles.priorityText, active && { color: "#fff" }]}> 
                            {d.department_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              ) : (
                <Text style={styles.muted}>Hedef birim bulunamadı.</Text>
              )}
            </View>

            <Pressable
              onPress={onCreateTask}
              disabled={creating}
              style={[styles.createSubmit, creating && { opacity: 0.6 }]}
            >
              <Text style={styles.createSubmitText}>
                {creating ? "Oluşturuluyor..." : "Görevi Oluştur"}
              </Text>
            </Pressable>

            <View style={{ height: 18 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
