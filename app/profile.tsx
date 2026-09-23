import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminWebShell } from "@/components/admin-web-shell";
import { palette } from "@/components/crm-ui";
import { UserAvatar } from "@/components/user-avatar";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { supabase } from "@/lib/supabase-client";

export default function ProfileScreen() {
  const { profile, session, refreshProfile, signOut } = useSupabaseAuth();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState("");
  const [passwordErrorMsg, setPasswordErrorMsg] = useState("");

  useEffect(() => {
    // 1. Initial name & phone from profile, metadata, or localStorage
    const savedName =
      (profile?.id && typeof window !== "undefined" && localStorage.getItem(`tips-crm-name-${profile.id}`)) ||
      profile?.full_name ||
      (session?.user?.user_metadata as any)?.full_name ||
      "";
    setFullName(savedName);

    const savedPhone =
      (profile?.id && typeof window !== "undefined" && localStorage.getItem(`tips-crm-phone-${profile.id}`)) ||
      (session?.user?.user_metadata as any)?.phone ||
      "";
    setPhone(savedPhone);

    // 2. Initial avatar
    const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url;
    if (metaAvatar) {
      setAvatarUrl(metaAvatar);
    } else if (profile?.id && typeof window !== "undefined") {
      const saved = localStorage.getItem(`tips-crm-avatar-${profile.id}`);
      if (saved) setAvatarUrl(saved);
    }
  }, [profile, session]);

  const handlePickAvatar = async () => {
    if (Platform.OS === "web") {
      fileInputRef.current?.click();
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        await saveAvatarUrl(base64Uri);
      }
    } catch (err: any) {
      showAlert("خطأ", "تعذر اختيار الصورة");
    }
  };

  const handleWebFileInput = (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Uri = e.target?.result as string;
      if (base64Uri) {
        await saveAvatarUrl(base64Uri);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveAvatarUrl = async (url: string) => {
    setUploadingAvatar(true);
    try {
      setAvatarUrl(url);
      if (profile?.id && typeof window !== "undefined") {
        localStorage.setItem(`tips-crm-avatar-${profile.id}`, url);
      }

      if (supabase) {
        await supabase.auth.updateUser({
          data: { avatar_url: url },
        });
        try {
          await supabase.rpc("tips_crm_update_my_profile", {
            new_full_name: fullName,
            new_avatar_url: url,
          });
        } catch {
          // ignore if rpc not created yet
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tips-user-updated", { detail: { avatarUrl: url, fullName } })
        );
      }

      await refreshProfile();
      setProfileSuccessMsg("تم حفظ وتحديث الصورة الشخصية بنجاح!");
      setTimeout(() => setProfileSuccessMsg(""), 3500);
    } catch (err: any) {
      showAlert("خطأ", err?.message || "تعذر حفظ الصورة");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      showAlert("تنبيه", "يرجى إدخال الاسم الكامل");
      return;
    }
    setSavingProfile(true);
    setProfileSuccessMsg("");
    try {
      // 1. Save to localStorage immediately
      if (profile?.id && typeof window !== "undefined") {
        localStorage.setItem(`tips-crm-name-${profile.id}`, trimmedName);
        localStorage.setItem(`tips-crm-phone-${profile.id}`, phone.trim());
      }

      // 2. Save to Supabase auth user metadata
      if (supabase) {
        await supabase.auth.updateUser({
          data: { full_name: trimmedName, phone: phone.trim() },
        });

        // 3. Try RPC or Direct Table Update
        try {
          await supabase.rpc("tips_crm_update_my_profile", {
            new_full_name: trimmedName,
            new_avatar_url: avatarUrl || undefined,
          });
        } catch {
          // fallback
          try {
            await (supabase as any)
              .schema("tips_crm")
              .from("profiles")
              .update({ full_name: trimmedName })
              .eq("id", profile?.id);
          } catch {}
        }
      }

      // 4. Notify app components
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tips-user-updated", { detail: { fullName: trimmedName, phone } })
        );
      }

      await refreshProfile();
      setProfileSuccessMsg("تم حفظ وتطبيق البيانات بنجاح!");
      setTimeout(() => setProfileSuccessMsg(""), 3500);
    } catch (err: any) {
      showAlert("خطأ", err?.message || "تعذر حفظ البيانات");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordErrorMsg("");
    setPasswordSuccessMsg("");

    if (!newPassword || newPassword.length < 6) {
      setPasswordErrorMsg("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg("كلمتا المرور غير متطابقتين");
      return;
    }

    setSavingPassword(true);
    try {
      if (!supabase) throw new Error("لا يوجد اتصال بالخادم");

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordSuccessMsg("تم تغيير كلمة المرور بنجاح");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccessMsg(""), 3500);
    } catch (err: any) {
      setPasswordErrorMsg(err?.message || "فشل تغيير كلمة المرور");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/login" as never);
    } catch (err) {
      console.error(err);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const content = (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Hidden Web File Input */}
      {Platform.OS === "web" && (
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef as any}
          style={{ display: "none" }}
          onChange={handleWebFileInput}
        />
      )}

      {/* Page Title & Subtitle */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الملف الشخصي</Text>
        <Text style={styles.headerSubtitle}>
          إدارة معلومات الحساب والصورة الشخصية والأمان
        </Text>
      </View>

      {/* Main Grid: Left Profile Card & Right Content */}
      <View style={styles.grid}>
        {/* Left Sticky Profile Card */}
        <View style={styles.profileCard}>
          {/* Avatar with Camera Overlay */}
          <View style={styles.avatarWrapper}>
            <UserAvatar
              src={avatarUrl}
              name={fullName || profile?.full_name || "مستخدم"}
              size={120}
              borderRadius={60}
              backgroundColor="#14A687"
              color="#FFFFFF"
              fontSize={36}
            />
          </View>

          {/* Upload / Change Photo Button */}
          <TouchableOpacity
            style={styles.changePhotoButton}
            onPress={handlePickAvatar}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
          >
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color="#14A687" />
            ) : (
              <>
                <MaterialIcons name="camera-alt" size={16} color="#14A687" />
                <Text style={styles.changePhotoText}>تغيير الصورة الشخصية</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.profileName}>{fullName || profile?.full_name || "مستخدم النظام"}</Text>
          <Text style={styles.profileEmail}>{profile?.email || "—"}</Text>

          <View style={styles.badgesWrapper}>
            <View style={styles.roleBadge}>
              <MaterialIcons name="shield" size={15} color="#14A687" />
              <Text style={styles.roleBadgeText}>
                {profile?.role_name || profile?.role_key || "مسؤول النظام"}
              </Text>
            </View>

            {profile?.active_company_name && (
              <View style={styles.companyBadge}>
                <MaterialIcons name="business" size={15} color="#64748B" />
                <Text style={styles.companyBadgeText}>
                  {profile.active_company_name}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardDivider} />

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <MaterialIcons name="logout" size={18} color="#EF4444" />
            <Text style={styles.logoutButtonText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>

        {/* Right Details Forms */}
        <View style={styles.detailsColumn}>
          {/* Personal Information Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="person" size={20} color={palette.primary} />
              <Text style={styles.cardTitle}>البيانات الشخصية</Text>
            </View>

            {profileSuccessMsg ? (
              <View style={styles.successBanner}>
                <MaterialIcons name="check" size={18} color="#059669" />
                <Text style={styles.successBannerText}>{profileSuccessMsg}</Text>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>الاسم بالكامل</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="badge" size={18} color="#94A3B8" />
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  style={styles.input}
                  placeholder="أدخل الاسم بالكامل"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>البريد الإلكتروني (للقراءة فقط)</Text>
              <View style={[styles.inputWrapper, styles.readOnlyInput]}>
                <MaterialIcons name="email" size={18} color="#94A3B8" />
                <TextInput
                  value={profile?.email || ""}
                  editable={false}
                  style={[styles.input, { color: "#64748B" }]}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>رقم الهاتف</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="phone" size={18} color="#94A3B8" />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  style={styles.input}
                  placeholder="09XXXXXXXX"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
                disabled={savingProfile}
                activeOpacity={0.8}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="save" size={18} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>حفظ التعديلات</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Security & Password Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="lock" size={20} color={palette.primary} />
              <Text style={styles.cardTitle}>الأمان وتغيير كلمة المرور</Text>
            </View>

            {passwordSuccessMsg ? (
              <View style={styles.successBanner}>
                <MaterialIcons name="check" size={18} color="#059669" />
                <Text style={styles.successBannerText}>{passwordSuccessMsg}</Text>
              </View>
            ) : null}

            {passwordErrorMsg ? (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={18} color="#DC2626" />
                <Text style={styles.errorBannerText}>{passwordErrorMsg}</Text>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>كلمة المرور الجديدة</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="lock-outline" size={18} color="#94A3B8" />
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  style={styles.input}
                  placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>تأكيد كلمة المرور الجديدة</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="lock-outline" size={18} color="#94A3B8" />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  style={styles.input}
                  placeholder="أعد إدخال كلمة المرور للتأكيد"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleChangePassword}
                disabled={savingPassword}
                activeOpacity={0.8}
              >
                {savingPassword ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="security" size={18} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>تحديث كلمة المرور</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <AdminWebShell title="الملف الشخصي">
      {content}
    </AdminWebShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    gap: 20,
  },
  header: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: palette.ink,
    textAlign: "right",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "right",
  },
  grid: {
    flexDirection: Platform.OS === "web" ? ("row-reverse" as any) : "column",
    gap: 24,
    alignItems: "flex-start",
  },
  profileCard: {
    flex: Platform.OS === "web" ? 0.35 : 1,
    width: Platform.OS === "web" ? undefined : "100%",
    minWidth: 280,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 26,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F2922",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  avatarWrapper: {
    marginBottom: 12,
    padding: 4,
    borderRadius: 65,
    backgroundColor: "#F0FDF8",
    borderWidth: 2,
    borderColor: "#CCEBE2",
  },
  changePhotoButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#E6F6F0",
    borderWidth: 1,
    borderColor: "#BDE6D9",
    marginBottom: 16,
  },
  changePhotoText: {
    color: "#14A687",
    fontSize: 12,
    fontWeight: "800",
  },
  profileName: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.ink,
    textAlign: "center",
  },
  profileEmail: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 3,
    textAlign: "center",
  },
  badgesWrapper: {
    width: "100%",
    gap: 8,
    marginTop: 18,
    alignItems: "center",
  },
  roleBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#E6F6F0",
  },
  roleBadgeText: {
    color: "#14A687",
    fontSize: 12,
    fontWeight: "800",
  },
  companyBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  companyBadgeText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },
  cardDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 20,
  },
  logoutButton: {
    width: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutButtonText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "800",
  },
  detailsColumn: {
    flex: Platform.OS === "web" ? 0.65 : 1,
    width: Platform.OS === "web" ? undefined : "100%",
    gap: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F2922",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.ink,
    textAlign: "right",
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  readOnlyInput: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: palette.ink,
    textAlign: "right",
  },
  cardActions: {
    marginTop: 12,
    alignItems: "flex-end",
  },
  saveButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#14A687",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  successBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#D1FAE5",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  successBannerText: {
    color: "#065F46",
    fontSize: 12,
    fontWeight: "700",
  },
  errorBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "700",
  },
});
