import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminWebShell } from "@/components/admin-web-shell";
import { palette } from "@/components/crm-ui";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { supabase } from "@/lib/supabase-client";

type SettingsTab = "company" | "notifications" | "security" | "appearance";

export default function SettingsScreen() {
  const { profile, refreshProfile } = useSupabaseAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("company");

  // Company / General settings state
  const [companyName, setCompanyName] = useState(profile?.active_company_name || "TIPS Pharma Distribution");
  const [companyTagline, setCompanyTagline] = useState("نظام إدارة التوزيع والزيارات الميدانية");
  const [supportEmail, setSupportEmail] = useState("support@tips-sd.com");
  const [supportPhone, setSupportPhone] = useState("+249 123 456 789");
  const [savingCompany, setSavingCompany] = useState(false);
  const [companySuccess, setCompanySuccess] = useState("");

  // Notification settings
  const [notifications, setNotifications] = useState({
    plans: true,
    collections: true,
    medicalAlerts: true,
    systemUpdates: false,
  });

  // Password / Security state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState("");
  const [securityError, setSecurityError] = useState("");

  // Appearance / Language state
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSaveCompany = async () => {
    setSavingCompany(true);
    setCompanySuccess("");
    try {
      if (supabase && profile?.active_company_id) {
        await supabase
          .from("tips_crm_companies")
          .update({ name: companyName.trim() })
          .eq("id", profile.active_company_id);
        await refreshProfile();
      }
      setCompanySuccess("تم حفظ إعدادات الشركة بنجاح");
      setTimeout(() => setCompanySuccess(""), 3500);
    } catch (err: any) {
      showAlert("خطأ", err?.message || "فشل حفظ الإعدادات");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleSaveSecurity = async () => {
    setSecurityError("");
    setSecuritySuccess("");

    if (!newPassword || newPassword.length < 6) {
      setSecurityError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityError("كلمتا المرور غير متطابقتين");
      return;
    }

    setSavingSecurity(true);
    try {
      if (!supabase) throw new Error("لا يوجد اتصال بالخادم");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSecuritySuccess("تم تغيير كلمة المرور بنجاح");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSecuritySuccess(""), 3500);
    } catch (err: any) {
      setSecurityError(err?.message || "تعذر تحديث كلمة المرور");
    } finally {
      setSavingSecurity(false);
    }
  };

  const tabs: { key: SettingsTab; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { key: "company", label: "بيانات الشركة", icon: "business" },
    { key: "notifications", label: "التنبيهات والإشعارات", icon: "notifications" },
    { key: "security", label: "الأمان والدخول", icon: "security" },
    { key: "appearance", label: "المظهر والعرض", icon: "palette" },
  ];

  const content = (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>إعدادات النظام</Text>
        <Text style={styles.headerSubtitle}>
          تخصيص هوية الشركة والتنبيهات وسياسات الأمان والمظهر
        </Text>
      </View>

      {/* Main Layout: Tabs on Left/Top, Tab Content on Right */}
      <View style={styles.layout}>
        {/* Navigation Tabs */}
        <View style={styles.tabsCard}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={tab.icon}
                  size={18}
                  color={isActive ? "#FFFFFF" : "#64748B"}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab Content Panels */}
        <View style={styles.panelColumn}>
          {/* TAB 1: Company / General */}
          {activeTab === "company" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="business" size={20} color={palette.primary} />
                <Text style={styles.cardTitle}>بيانات الشركة وهوية النظام</Text>
              </View>

              {companySuccess ? (
                <View style={styles.successBanner}>
                  <MaterialIcons name="check" size={18} color="#059669" />
                  <Text style={styles.successBannerText}>{companySuccess}</Text>
                </View>
              ) : null}

              <View style={styles.formGroup}>
                <Text style={styles.label}>اسم الشركة الرسمي</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="store" size={18} color="#94A3B8" />
                  <TextInput
                    value={companyName}
                    onChangeText={setCompanyName}
                    style={styles.input}
                    placeholder="اسم الشركة"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>الشعار النصي (Tagline)</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="subtitles" size={18} color="#94A3B8" />
                  <TextInput
                    value={companyTagline}
                    onChangeText={setCompanyTagline}
                    style={styles.input}
                    placeholder="وصف أو شعار المؤسسة"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>بريد الدعم الفني والمراسلات</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="email" size={18} color="#94A3B8" />
                  <TextInput
                    value={supportEmail}
                    onChangeText={setSupportEmail}
                    style={styles.input}
                    placeholder="support@company.com"
                    keyboardType="email-address"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>هاتف التواصل والإدارة</Text>
                <View style={styles.inputWrapper}>
                  <MaterialIcons name="phone" size={18} color="#94A3B8" />
                  <TextInput
                    value={supportPhone}
                    onChangeText={setSupportPhone}
                    style={styles.input}
                    placeholder="+249..."
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSaveCompany}
                  disabled={savingCompany}
                  activeOpacity={0.8}
                >
                  {savingCompany ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="save" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>حفظ إعدادات الشركة</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 2: Notifications */}
          {activeTab === "notifications" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="notifications-active" size={20} color={palette.primary} />
                <Text style={styles.cardTitle}>تفضيلات التنبيهات والإشعارات</Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleTitle}>إشعارات اعتماد الخطط الأسبوعية</Text>
                  <Text style={styles.toggleDesc}>
                    استلام تنبيه عند تقديم مندوب لخطة أسبوعية جديدة بانتظار الاعتماد
                  </Text>
                </View>
                <Switch
                  value={notifications.plans}
                  onValueChange={(val) => setNotifications((p) => ({ ...p, plans: val }))}
                  trackColor={{ false: "#CBD5E1", true: "#14A687" }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleTitle}>إشعارات التحصيل المالي اليومي</Text>
                  <Text style={styles.toggleDesc}>
                    إشعار فوري عند قفل ومطابقة دفعات وتحصيلات المندوبين اليومية
                  </Text>
                </View>
                <Switch
                  value={notifications.collections}
                  onValueChange={(val) => setNotifications((p) => ({ ...p, collections: val }))}
                  trackColor={{ false: "#CBD5E1", true: "#14A687" }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleTitle}>تنبيهات البرامج الطبية والملاحظات</Text>
                  <Text style={styles.toggleDesc}>
                    تنبيهات الزيارات الطبية والملاحظات الإكلينيكية الهامة
                  </Text>
                </View>
                <Switch
                  value={notifications.medicalAlerts}
                  onValueChange={(val) => setNotifications((p) => ({ ...p, medicalAlerts: val }))}
                  trackColor={{ false: "#CBD5E1", true: "#14A687" }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleTitle}>تحديثات النظام وإعلانات الصيانة</Text>
                  <Text style={styles.toggleDesc}>
                    إشعارات التحديثات البرمجية والتحسينات الجديدة
                  </Text>
                </View>
                <Switch
                  value={notifications.systemUpdates}
                  onValueChange={(val) => setNotifications((p) => ({ ...p, systemUpdates: val }))}
                  trackColor={{ false: "#CBD5E1", true: "#14A687" }}
                />
              </View>
            </View>
          )}

          {/* TAB 3: Security */}
          {activeTab === "security" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="lock" size={20} color={palette.primary} />
                <Text style={styles.cardTitle}>إعدادات الأمان وتغيير كلمة المرور</Text>
              </View>

              {securitySuccess ? (
                <View style={styles.successBanner}>
                  <MaterialIcons name="check" size={18} color="#059669" />
                  <Text style={styles.successBannerText}>{securitySuccess}</Text>
                </View>
              ) : null}

              {securityError ? (
                <View style={styles.errorBanner}>
                  <MaterialIcons name="error-outline" size={18} color="#DC2626" />
                  <Text style={styles.errorBannerText}>{securityError}</Text>
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
                    placeholder="6 أحرف على الأقل"
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
                  />
                </View>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSaveSecurity}
                  disabled={savingSecurity}
                  activeOpacity={0.8}
                >
                  {savingSecurity ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="security" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>تحديث كلمة المرور</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 4: Appearance */}
          {activeTab === "appearance" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="palette" size={20} color={palette.primary} />
                <Text style={styles.cardTitle}>المظهر وخيارات العرض</Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleTitle}>اللغة والاتجاه</Text>
                  <Text style={styles.toggleDesc}>العربية (RTL) مفعلة بشكل افتراضي</Text>
                </View>
                <View style={styles.langBadge}>
                  <Text style={styles.langBadgeText}>العربية (AR)</Text>
                </View>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleTitle}>العرض المضغوط (Compact Mode)</Text>
                  <Text style={styles.toggleDesc}>
                    تقليل الهوامش والمسافات لعرض المزيد من البيانات على الشاشات الكبيرة
                  </Text>
                </View>
                <Switch
                  value={compactMode}
                  onValueChange={setCompactMode}
                  trackColor={{ false: "#CBD5E1", true: "#14A687" }}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );

  return (
    <AdminWebShell title="إعدادات النظام">
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
  layout: {
    flexDirection: Platform.OS === "web" ? ("row-reverse" as any) : "column",
    gap: 24,
    alignItems: "flex-start",
  },
  tabsCard: {
    flex: Platform.OS === "web" ? 0.3 : 1,
    width: Platform.OS === "web" ? undefined : "100%",
    minWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F2922",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tabButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: "#14A687",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    textAlign: "right",
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  panelColumn: {
    flex: Platform.OS === "web" ? 0.7 : 1,
    width: Platform.OS === "web" ? undefined : "100%",
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
  primaryButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#14A687",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  toggleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 16,
  },
  toggleTextWrapper: {
    flex: 1,
    alignItems: "flex-end",
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.ink,
    textAlign: "right",
  },
  toggleDesc: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    textAlign: "right",
  },
  langBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#E6F6F0",
  },
  langBadgeText: {
    color: "#14A687",
    fontSize: 12,
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
