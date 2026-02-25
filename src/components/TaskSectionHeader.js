import React from "react";
import { View, Text } from "react-native";

export default function TaskSectionHeader({ title, count, accent, styles }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: accent, borderColor: accent }]}> 
      <View style={[styles.dot, { backgroundColor: "rgba(255,255,255,0.95)" }]} />
      <Text style={[styles.sectionTitle, { color: "#fff" }]}>{title}</Text>
      <View
        style={[
          styles.countBadge,
          {
            borderColor: "rgba(255,255,255,0.6)",
            backgroundColor: "rgba(255,255,255,0.18)",
          },
        ]}
      >
        <Text style={[styles.countBadgeText, { color: "#fff" }]}>{count}</Text>
      </View>
    </View>
  );
}
