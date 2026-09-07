import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AdminWebShell } from "@/components/admin-web-shell";
import { palette } from "@/components/crm-ui";
import { supabase } from "@/lib/supabase-client";

type RemoteEvent = {
  event_id: string;
  title: string;
  topic: string;
  focus_product: string | null;
  starts_at: string;
  venue: string;
  state: string;
  city: string;
  notes: string | null;
  rep_name: string | null;
  invite_count: number;
  confirmed_count: number;
  attended_count: number;
  follow_up_count: number;
};

type RemoteInvitation = {
  id: string;
  event_id: string;
  account_id: string;
  invitation_status: string;
  notes: string | null;
  accounts?: { name: string; specialty: string | null } | null;
};

export default function MedicalEventDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<RemoteEvent | null>(null);
  const [invitations, setInvitations] = useState<RemoteInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    if (!id || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [eventsResult, invitationsResult] = await Promise.all([
        supabase.rpc("tips_crm_medical_event_overview"),
        supabase
          .schema("tips_crm")
          .from("medical_event_invitations")
          .select("id,event_id,account_id,invitation_status,notes,accounts(name,specialty)")
          .eq("event_id", id),
      ]);

      if (eventsResult.error) throw eventsResult.error;
      const allEvents = (eventsResult.data ?? []) as RemoteEvent[];
      const currentEvent = allEvents.find((item) => item.event_id === id) ?? null;
      if (!currentEvent) {
        setError("لم يتم العثور على الفعالية المطلوبة.");
      } else {
        setEvent(currentEvent);
      }

      if (invitationsResult.error) throw invitationsResult.error;
      const rawInvitations = (invitationsResult.data ?? []) as Array<{
        id: string;
        event_id: string;
        account_id: string;
        invitation_status: string;
        notes: string | null;
        accounts?: { name: string; specialty: string | null } | Array<{ name: string; specialty: string | null }> | null;
      }>;
      setInvitations(
        rawInvitations.map((item) => ({
          id: item.id,
          event_id: item.event_id,
          account_id: item.account_id,
          invitation_status: item.invitation_status,
          notes: item.notes,
          accounts: Array.isArray(item.accounts) ? item.accounts[0] ?? null : item.accounts ?? null,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل بيانات الفعالية.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const updateStatus = async (invitationId: string, nextStatus: string) => {
    if (!supabase) return;
    setUpdatingId(invitationId);
    try {
      const { error: updateError } = await supabase.rpc("tips_crm_update_medical_event_invitation", {
        invitation_uuid: invitationId,
        next_status: nextStatus,
        note: null,
      });
      if (updateError) throw updateError;
      setInvitations((current) =>
        current.map((item) => (item.id === invitationId ? { ...item, invitation_status: nextStatus } : item)),
      );
    } catch (err) {
      Alert.alert("تعذر تحديث الحالة", err instanceof Error ? err.message : "حاول مرة أخرى.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AdminWebShell title="تفاصيل الفعالية العلمية">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.push("/company/medical-program" as never)} style={styles.backButton}>
          <MaterialIcons name="arrow-forward" size={18} color={palette.primary} />
          <Text style={styles.backText}>العودة إلى البرنامج الطبي</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={styles.stateText}>جارٍ تحميل تفاصيل الفعالية…</Text>
          </View>
        ) : error || !event ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={28} color={palette.error} />
            <Text style={styles.errorTitle}>{error || "الفعالية غير موجودة"}</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <MaterialIcons name="event" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>{event.title}</Text>
                <Text style={styles.heroMeta}>
                  {event.topic} {event.focus_product ? `· محور: ${event.focus_product}` : ""}
                </Text>
                <Text style={styles.heroMeta}>
                  {new Date(event.starts_at).toLocaleString("ar")} · {event.venue} ({event.city})
                </Text>
              </View>
              <View style={styles.countsRow}>
                <CountBadge label="مدعو" value={invitations.length} />
                <CountBadge
                  label="مؤكد"
                  value={invitations.filter((i) => i.invitation_status === "confirmed").length}
                />
                <CountBadge
                  label="حضر"
                  value={invitations.filter((i) => i.invitation_status === "attended").length}
                />
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="people" size={20} color={palette.primary} />
                <Text style={styles.sectionTitle}>قائمة الأطباء المدعوين وحالة الحضور ({invitations.length})</Text>
              </View>

              {invitations.length ? (
                <View style={styles.list}>
                  {invitations.map((invitation) => (
                    <View key={invitation.id} style={styles.invitationRow}>
                      <View style={styles.actions}>
                        {[
                          { key: "confirmed", label: "مؤكد" },
                          { key: "attended", label: "حضر" },
                          { key: "declined", label: "اعتذر" },
                          { key: "follow_up", label: "متابعة" },
                        ].map((choice) => {
                          const isActive = invitation.invitation_status === choice.key;
                          return (
                            <TouchableOpacity
                              key={choice.key}
                              disabled={updatingId === invitation.id}
                              onPress={() => void updateStatus(invitation.id, choice.key)}
                              style={[styles.statusButton, isActive && styles.statusButtonActive]}
                            >
                              <Text style={[styles.statusText, isActive && styles.statusTextActive]}>
                                {choice.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={styles.doctorInfo}>
                        <Text style={styles.doctorName}>{invitation.accounts?.name ?? "طبيب مدعو"}</Text>
                        <Text style={styles.doctorSpecialty}>
                          {invitation.accounts?.specialty ?? "تخصص عام"} · الحالة الحالية:{" "}
                          <Text style={styles.highlightStatus}>
                            {invitation.invitation_status === "confirmed"
                              ? "مؤكد الحضور"
                              : invitation.invitation_status === "attended"
                                ? "حضر الفعالية"
                                : invitation.invitation_status === "declined"
                                  ? "اعتذر عن الحضور"
                                  : "بانتظار التأكيد"}
                          </Text>
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.empty}>
                  <MaterialIcons name="person-off" size={24} color={palette.muted} />
                  <Text style={styles.emptyText}>لم يتم تسجيل أطباء مدعوين لهذه الفعالية بعد.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </AdminWebShell>
  );
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeValue}>{value}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 36, gap: 14 },
  backButton: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 4, alignSelf: "flex-start" },
  backText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  state: { minHeight: 200, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { color: palette.muted, fontSize: 13 },
  errorCard: { padding: 24, borderRadius: 16, backgroundColor: "#FFF1F1", alignItems: "center", gap: 8 },
  errorTitle: { color: palette.error, fontSize: 14, fontWeight: "800" },
  hero: { minHeight: 120, padding: 20, borderRadius: 18, backgroundColor: "#234258", flexDirection: "row-reverse", gap: 14, alignItems: "center" },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#3A7C9E", alignItems: "center", justifyContent: "center" },
  heroText: { flex: 1, alignItems: "flex-end" },
  heroTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", textAlign: "right" },
  heroMeta: { color: "#D4EAF3", fontSize: 11, marginTop: 4, textAlign: "right" },
  countsRow: { flexDirection: "row-reverse", gap: 6 },
  badge: { minWidth: 50, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center" },
  badgeValue: { color: palette.primary, fontSize: 15, fontWeight: "900" },
  badgeLabel: { color: palette.muted, fontSize: 9, fontWeight: "800", marginTop: 2 },
  section: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#DFEAE6" },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EDF3F0" },
  sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "900" },
  list: { marginTop: 10 },
  invitationRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F2F6F4" },
  doctorInfo: { flex: 1, alignItems: "flex-end", paddingRight: 10 },
  doctorName: { color: palette.ink, fontSize: 13, fontWeight: "800", textAlign: "right" },
  doctorSpecialty: { color: palette.muted, fontSize: 11, marginTop: 3, textAlign: "right" },
  highlightStatus: { color: palette.primary, fontWeight: "800" },
  actions: { flexDirection: "row-reverse", gap: 6 },
  statusButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#D5E2DD", backgroundColor: "#F7FAF8" },
  statusButtonActive: { backgroundColor: "#0D8068", borderColor: "#0D8068" },
  statusText: { color: palette.muted, fontSize: 10, fontWeight: "800" },
  statusTextActive: { color: "#FFFFFF" },
  empty: { paddingVertical: 28, alignItems: "center", gap: 6 },
  emptyText: { color: palette.muted, fontSize: 12 },
});
