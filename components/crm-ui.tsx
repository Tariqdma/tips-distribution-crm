import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import type { Account, PlanStatus, VisitStatus } from "@/lib/crm-store";

export const palette = {
  ink: "#13231F",
  muted: "#68756F",
  primary: "#075E54",
  teal: "#11A683",
  canvas: "#F6F8F7",
  surface: "#FFFFFF",
  line: "#E5ECE8",
  warning: "#B86D08",
  warningBg: "#FFF6E5",
  success: "#087C61",
  successBg: "#E9F8F2",
  error: "#B63838",
  errorBg: "#FFF0F0",
  info: "#1D5DA8",
  infoBg: "#EEF5FF",
};

export function AppHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onPress} style={styles.textAction}>
          <Text style={styles.textActionLabel}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  icon,
  tone = "teal",
  compact = false,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tone?: "teal" | "blue" | "amber";
  compact?: boolean;
}) {
  const tones = {
    teal: { bg: "#E9F8F2", icon: palette.primary },
    blue: { bg: "#EEF5FF", icon: palette.info },
    amber: { bg: "#FFF6E5", icon: palette.warning },
  };
  const colors = tones[tone];
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact]}>
      <View style={[styles.metricIcon, { backgroundColor: colors.bg }]}>
        <MaterialIcons name={icon} size={19} color={colors.icon} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text>
        <Text style={[styles.metricLabel, compact && styles.metricLabelCompact]}>{label}</Text>
      </View>
    </View>
  );
}

export function StatusBadge({ status }: { status: PlanStatus | VisitStatus }) {
  const appearance: Record<string, { bg: string; color: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
    "معتمدة": { bg: palette.successBg, color: palette.success, icon: "verified" },
    "مكتملة": { bg: palette.successBg, color: palette.success, icon: "check-circle" },
    "بانتظار الاعتماد": { bg: palette.warningBg, color: palette.warning, icon: "hourglass-top" },
    "مجدولة": { bg: palette.infoBg, color: palette.info, icon: "event" },
    "معادة للمراجعة": { bg: palette.errorBg, color: palette.error, icon: "reply" },
    "تحتاج مراجعة": { bg: palette.errorBg, color: palette.error, icon: "error-outline" },
    "مسودة": { bg: "#F1F3F2", color: palette.muted, icon: "edit-note" },
  };
  const item = appearance[status] ?? appearance["مسودة"];
  return (
    <View style={[styles.badge, { backgroundColor: item.bg }]}>
      <MaterialIcons name={item.icon} size={14} color={item.color} />
      <Text style={[styles.badgeText, { color: item.color }]}>{status}</Text>
    </View>
  );
}

export function AccountAvatar({ account, size = 42 }: { account: Account; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: account.accent }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.29 }]}>{account.initials}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon = "chevron-left",
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton, style]}
      activeOpacity={0.86}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <MaterialIcons name={icon} size={20} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.secondaryButton} activeOpacity={0.8}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
      {icon ? <MaterialIcons name={icon} size={19} color={palette.primary} /> : null}
    </TouchableOpacity>
  );
}

export function InfoRow({ icon, title, value }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={styles.infoValue}>{value}</Text>
        <Text style={styles.infoLabel}>{title}</Text>
      </View>
      <View style={styles.infoIcon}>
        <MaterialIcons name={icon} size={18} color={palette.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 54, marginBottom: 18 },
  headerRight: { marginLeft: 12 },
  eyebrow: { color: palette.muted, fontSize: 12, textAlign: "right", marginBottom: 3 },
  headerTitle: { color: palette.ink, fontSize: 25, fontWeight: "800", textAlign: "right", lineHeight: 32 },
  sectionRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 11 },
  sectionTitle: { color: palette.ink, fontWeight: "800", fontSize: 17, textAlign: "right" },
  textAction: { paddingVertical: 6, paddingHorizontal: 2 },
  textActionLabel: { color: palette.primary, fontWeight: "700", fontSize: 13 },
  metricCard: { flex: 1, minWidth: 104, backgroundColor: palette.surface, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: palette.line, gap: 9, alignItems: "flex-end" },
  metricCardCompact: { minWidth: 0, padding: 10, borderRadius: 15, gap: 6 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metricValue: { color: palette.ink, fontSize: 20, fontWeight: "800", lineHeight: 24 },
  metricValueCompact: { fontSize: 17, lineHeight: 21 },
  metricLabel: { color: palette.muted, fontSize: 11, textAlign: "right", marginTop: 2 },
  metricLabelCompact: { fontSize: 9, lineHeight: 13 },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontWeight: "800" },
  primaryButton: { minHeight: 52, backgroundColor: palette.primary, borderRadius: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18 },
  disabledButton: { opacity: 0.45 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: "#B8D7CF", borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 15 },
  secondaryButtonText: { color: palette.primary, fontWeight: "800", fontSize: 14 },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EDF1EF" },
  infoIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F1F7F5", alignItems: "center", justifyContent: "center" },
  infoValue: { color: palette.ink, fontSize: 14, fontWeight: "700", textAlign: "right" },
  infoLabel: { color: palette.muted, fontSize: 11, marginTop: 2, textAlign: "right" },
});
