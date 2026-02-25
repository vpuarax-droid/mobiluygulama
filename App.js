import "react-native-gesture-handler";

import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import LoginScreen from "./src/screens/LoginScreen";
import TasksScreen from "./src/screens/TasksScreen";
import { getToken } from "./src/services/auth";
import { registerAndSyncPushToken } from "./src/services/pushNotifications";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  async function bootstrap() {
    const token = await getToken();
    setLoggedIn(!!token);
    setBooting(false);
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (loggedIn) {
      registerAndSyncPushToken().catch(() => {});
    }
  }, [loggedIn]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {booting ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : loggedIn ? (
          <TasksScreen onLoggedOut={() => setLoggedIn(false)} />
        ) : (
          <LoginScreen onLoggedIn={() => setLoggedIn(true)} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
