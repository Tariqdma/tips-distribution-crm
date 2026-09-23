import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AdminWebShell } from "@/components/admin-web-shell";
import { palette } from "@/components/crm-ui";
import { mapReceiptSearchRecord, type ReceiptSearchRecord, type RemoteReceiptSearchRecord } from "@/lib/receipt-search";
import { supabase } from "@/lib/supabase-client";

const currency = (value: number) => `${new Intl.NumberFormat("ar").format(value)} ج.س`;
const dateText = (value: string) =>
  new Intl.DateTimeFormat("ar", { timeZone: "Africa/Khartoum", year: "numeric", month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00Z`),
  );

export default function ReceiptDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<ReceiptSearchRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!id || !supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase.rpc("tips_crm_search_receipt_records", {
          search_query: id,
          date_from: null,
          date_to: null,
          result_limit: 10,
        });
        if (queryError) throw queryError;
        const list = ((data ?? []) as RemoteReceiptSearchRecord[]).map(mapReceiptSearchRecord);
        const match = list.find((item) => item.visitId === id) ?? list[0] ?? null;
        if (!match) {
          setError("لم يتم العثور على سجل الإيصال المطلوب.");
        } else {
          setRecord(match);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر تحميل بيانات الإيصال.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  return (
    <AdminWebShell title="تفاصيل الإيصال">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.push("/company/receipt-search" as never)} style={styles.backButton}>
          <MaterialIcons name="arrow-forward" size={18} color={palette.primary} />
          <Text style={styles.backText}>العودة إلى بحث الإيصالات</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={styles.stateText}>جارٍ تحميل تفاصيل الإيصال…</Text>
          </View>
        ) : error || !record ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={28} color={palette.error} />
            <Text style={styles.errorTitle}>{error || "السجل غير موجود"}</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroBadge}>
                <MaterialIcons name="receipt-long" size={26} color="#FFFFFF" />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>إيصال رقم: {record.receiptReference}</Text>
                <Text style={styles.heroMeta}>
                  {record.accountName} · {dateText(record.reportDate)}
                </Text>
              </View>
              <View style={styles.amountPill}>
                <Text style={styles.amountLabel}>المبلغ المحصل</Text>
                <Text style={styles.amountValue}>{currency(record.collectionAmount)}</Text>
              </View>
            </View>

            <View style={styles.grid}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialIcons name="storefront" size={20} color={palette.primary} />
                  <Text style={styles.cardTitle}>بيانات الجهة / العميل</Text>
                </View>
                <DetailRow label="اسم الجهة" value={record.accountName} />
                <DetailRow label="نوع النشاط" value={record.accountType} />
                <DetailRow label="المنطقة والمدينة" value={`${record.city} · ${record.area || record.state}`} />
                {record.address ? <DetailRow label="العنوان" value={record.address} /> : null}
                {record.accountPhone ? <DetailRow label="رقم الهاتف" value={record.accountPhone} /> : null}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialIcons name="person" size={20} color={palette.primary} />
                  <Text style={styles.cardTitle}>بيانات المندوب والزيارة</Text>
                </View>
                <DetailRow label="المندوب المسجل" value={record.repName} />
                {record.repEmail ? <DetailRow label="البريد الإلكتروني" value={record.repEmail} /> : null}
                {record.territoryName ? <DetailRow label="منطقة التغطية" value={record.territoryName} /> : null}
                <DetailRow label="وقت التوثيق" value={record.checkedInAt || "—"} />
                {record.outcome ? <DetailRow label="نتيجة الزيارة" value={record.outcome} /> : null}
              </View>

              <View style={[styles.card, styles.fullWidth]}>
                <View style={styles.cardHeader}>
                  <MaterialIcons name="fact-check" size={20} color={palette.primary} />
                  <Text style={styles.cardTitle}>البيانات المالية والملاحظات</Text>
                </View>
                <DetailRow label="رقم الإيصال / الفاتورة" value={record.receiptReference} />
                <DetailRow label="مبلغ التحصيل" value={currency(record.collectionAmount)} />
                {record.revenueAmount ? <DetailRow label="مبلغ المبيعات" value={currency(record.revenueAmount)} /> : null}
                {record.notes ? <DetailRow label="ملاحظات الميدان" value={record.notes} /> : null}
                {record.followUpAction ? <DetailRow label="خطوة المتابعة" value={`${record.followUpAction} (${record.followUpOn || "غير محدد"})`} /> : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </AdminWebShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailValue}>{value}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 34 },
  backButton: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 14, alignSelf: "flex-start" },
  backText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  state: { minHeight: 200, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { color: palette.muted, fontSize: 13 },
  errorCard: { padding: 24, borderRadius: 16, backgroundColor: "#FFF1F1", alignItems: "center", gap: 8 },
  errorTitle: { color: palette.error, fontSize: 14, fontWeight: "800" },
  hero: { minHeight: 110, padding: 20, borderRadius: 18, backgroundColor: "#143D35", flexDirection: "row-reverse", gap: 14, alignItems: "center" },
  heroBadge: { width: 48, height: 48, borderRadius: 15, backgroundColor: "#0B8067", alignItems: "center", justifyContent: "center" },
  heroText: { flex: 1, alignItems: "flex-end" },
  heroTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  heroMeta: { color: "#CBEDE6", fontSize: 12, marginTop: 4, textAlign: "right" },
  amountPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center" },
  amountLabel: { color: palette.muted, fontSize: 10, fontWeight: "700" },
  amountValue: { color: palette.success, fontSize: 15, fontWeight: "900", marginTop: 2 },
  grid: { marginTop: 18, flexDirection: "row-reverse", flexWrap: "wrap", gap: 14 },
  card: { flex: 1, minWidth: 320, padding: 18, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2ECE7" },
  fullWidth: { flexBasis: "100%" },
  cardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EDF3F0", marginBottom: 8 },
  cardTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  detailRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#F4F7F5" },
  detailLabel: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  detailValue: { color: palette.ink, fontSize: 12, fontWeight: "800", maxWidth: "60%", textAlign: "left" },
});
