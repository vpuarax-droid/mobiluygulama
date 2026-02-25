import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const TOKEN_KEY = "token";

// LoginScreen saveToken çağırdığı için bunu ekliyoruz ✅
export async function saveToken(token) {
  return AsyncStorage.setItem(TOKEN_KEY, String(token));
}

// İstersen setToken da kalsın (aynı işi yapar) ✅
export async function setToken(token) {
  return AsyncStorage.setItem(TOKEN_KEY, String(token));
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearToken() {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

// ✅ Token gerçekten geçerli mi? Backend’e sor.
export async function hasValidSession() {
  const token = await getToken();
  if (!token) return false;

  try {
    await api.get("/system/api/tasks.php", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch (e) {
    await clearToken();
    return false;
  }
}
