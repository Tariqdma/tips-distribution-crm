import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { MetricCard, PrimaryButton, palette } from "@/components/crm-ui";
import { PlatformWebShell, type PlatformTabKey } from "@/components/platform-web-shell";
import { getApiBaseUrl } from "@/constants/oauth";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export type Company = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_key: string;
  max_user_limit?: number;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  created_at: string;
};

export type CompanyRequest = {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  expected_user_count: number | null;
  activity_type: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  review_note: string | null;
  invitation_sent_at: string | null;
  invitation_activated_at: string | null;
  invitation_cancelled_at: string | null;
  approved_company_id: string | null;
  manager_full_name: string | null;
  manager_email: string | null;
  latest_email_status: string | null;
};

type ApprovalForm = {
  companySlug: string;
  managerFullName: string;
  managerEmail: string;
  managerPassword: string;
  planKey: string;
  maxUserLimit: string;
};

type RequestNote = {
  id: string;
  note_text: string;
  created_at: string;
  created_by_name: string | null;
};

const PLAN_TIERS: Record<string, { name: string; defaultLimit: number; badgeColor: string }> = {
  free_trial: { name: "تجربة مجانية", defaultLimit: 5, badgeColor: "#64748B" },
  starter: { name: "باقة البداية", defaultLimit: 10, badgeColor: "#0284C7" },
  standard: { name: "الباقة القياسية", defaultLimit: 20, badgeColor: "#059669" },
  pro: { name: "الباقة الاحترافية", defaultLimit: 50, badgeColor: "#7C3AED" },
  enterprise: { name: "باقة المؤسسات", defaultLimit: 200, badgeColor: "#D97706" },
  custom: { name: "باقة مخصصة", defaultLimit: 500, badgeColor: "#DC2626" },
};

const blankApproval: ApprovalForm = {
  companySlug: "",
  managerFullName: "",
  managerEmail: "",
  managerPassword: "",
  planKey: "standard",
  maxUserLimit: "20",
};

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("انتهت مهلة الاتصال بخدمة المنصة.")), milliseconds)
    ),
  ]);
}

function dateArabic(value: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("ar", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function slugFromCompanyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function requestStatusLabel(status: string) {
  return (
    ({
      submitted: "قيد المراجعة",
      awaiting_info: "بانتظار معلومات",
      approved: "تم الاعتماد",
      invitation_sent: "الدعوة أُرسلت",
      manager_activated: "المدير فعّل حسابه",
      rejected: "مرفوض",
      cancelled: "الدعوة ملغاة",
    } as Record<string, string>)[status] ?? status
  );
}

function requestStatusColor(status: string) {
  return ["rejected", "cancelled"].includes(status)
    ? palette.error
    : status === "manager_activated"
    ? palette.success
    : ["approved", "invitation_sent"].includes(status)
    ? palette.primary
    : palette.warning;
}

export default function PlatformPortalScreen() {
  const { profile, session, loading, refreshProfile } = useSupabaseAuth();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= 850;

  const [activeTab, setActiveTab] = useState<PlatformTabKey>("overview");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [companySearch, setCompanySearch] = useState("");
  const [companyStatusFilter, setCompanyStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  // Approval Modal State
  const [activeApproval, setActiveApproval] = useState<CompanyRequest | null>(null);
  const [approval, setApproval] = useState<ApprovalForm>(blankApproval);

  // Plan Edit Modal State
  const [editingCompanyPlan, setEditingCompanyPlan] = useState<Company | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState("standard");
  const [customUserLimit, setCustomUserLimit] = useState("20");

  // Review & Request Info States
  const [reviewRequest, setReviewRequest] = useState<CompanyRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [infoRequest, setInfoRequest] = useState<CompanyRequest | null>(null);
  const [infoNote, setInfoNote] = useState("");

  // Notes State
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [notesByRequest, setNotesByRequest] = useState<Record<string, RequestNote[]>>({});
  const [noteDraft, setNoteDraft] = useState("");

  // Direct Create Form State
  const [direct, setDirect] = useState({
    companyName: "",
    companySlug: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    expectedUserCount: "20",
    notes: "",
    managerFullName: "",
    managerEmail: "",
    managerPassword: "",
    planKey: "standard",
  });

  const [submitting, setSubmitting] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.is_platform_admin && profile?.role_key !== "platform_admin" && profile?.email !== "platform.admin@tips-sd.com") {
      setFetching(false);
      return;
    }
    setFetching(true);
    setError(null);

    let loadedCompanies: Company[] = [];
    let loadedRequests: CompanyRequest[] = [];

    // 1. Fetch Companies
    try {
      if (supabase) {
        const { data: rpcCompanies, error: rpcErr } = await supabase.rpc("tips_crm_list_platform_companies");
        if (!rpcErr && rpcCompanies && Array.isArray(rpcCompanies)) {
          loadedCompanies = (rpcCompanies as any[]).map((c) => ({
            id: c.company_id || c.id,
            name: c.company_name || c.name || "شركة",
            slug: c.company_slug || c.slug || "",
            status: c.status || "active",
            plan_key: c.plan_key || c.payment_tier_key || "standard",
            max_user_limit: c.max_user_limit ?? 20,
            primary_contact_name: c.primary_manager_name || c.primary_contact_name || null,
            primary_contact_email: c.primary_manager_email || c.primary_contact_email || null,
            created_at: c.created_at || new Date().toISOString(),
          }));
        }
      }
    } catch {
      // ignore
    }

    if (loadedCompanies.length === 0) {
      try {
        const token = session?.access_token;
        const res = await withTimeout(
          fetch(`${getApiBaseUrl()}/api/platform/companies`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
          4000
        );
        if (res.ok) {
          const data = (await res.json()) as { companies?: Company[] };
          if (Array.isArray(data.companies)) {
            loadedCompanies = data.companies;
          }
        }
      } catch {
        // ignore
      }
    }

    // 2. Fetch Requests
    try {
      if (supabase) {
        const { data: rpcRequests, error: rpcErr } = await supabase.rpc("tips_crm_list_platform_company_requests");
        if (!rpcErr && rpcRequests && Array.isArray(rpcRequests)) {
          loadedRequests = rpcRequests as CompanyRequest[];
        }
      }
    } catch {
      // ignore
    }

    if (loadedRequests.length === 0) {
      try {
        const token = session?.access_token;
        const res = await withTimeout(
          fetch(`${getApiBaseUrl()}/api/platform/company-requests`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
          4000
        );
        if (res.ok) {
          const data = (await res.json()) as { requests?: CompanyRequest[] };
          if (Array.isArray(data.requests)) {
            loadedRequests = data.requests;
          }
        }
      } catch {
        // ignore
      }
    }

    setCompanies(loadedCompanies);
    setRequests(loadedRequests);
    setFetching(false);
  }, [profile, session?.access_token]);

  useEffect(() => {
    const timer = setTimeout(() => setAuthTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const requestApi = async (path: string, payload?: unknown, method: "POST" | "GET" = "POST") => {
    const token = session?.access_token;
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || "تعذر تنفيذ العملية.");
    }
    return body;
  };

  const loadNotes = async (requestId: string) => {
    try {
      const data = await requestApi(`/api/platform/company-requests/${requestId}/notes`, undefined, "GET");
      setNotesByRequest((prev) => ({ ...prev, [requestId]: data.notes || [] }));
    } catch {
      // ignore
    }
  };

  const addNote = async (requestId: string) => {
    if (!noteDraft.trim()) return;
    try {
      await requestApi(`/api/platform/company-requests/${requestId}/notes`, { noteText: noteDraft.trim() });
      setNoteDraft("");
      await loadNotes(requestId);
    } catch {
      Alert.alert("خطأ", "تعذر إضافة الملاحظة.");
    }
  };

  const startApproval = (req: CompanyRequest) => {
    setActiveApproval(req);
    setApproval({
      companySlug: slugFromCompanyName(req.company_name),
      managerFullName: req.contact_name,
      managerEmail: req.contact_email,
      managerPassword: "",
      planKey: "standard",
      maxUserLimit: String(req.expected_user_count || 20),
    });
  };

  const submitApproval = async () => {
    if (!activeApproval) return;
    setSubmitting(true);
    setError(null);

    const limitNum = Number.parseInt(approval.maxUserLimit, 10) || 20;

    try {
      if (supabase) {
        const { error: rpcErr } = await supabase.rpc("tips_crm_approve_company_request", {
          p_request_id: activeApproval.id,
          p_company_slug: approval.companySlug.trim(),
          p_manager_name: approval.managerFullName.trim(),
          p_manager_email: approval.managerEmail.trim(),
          p_temporary_password: approval.managerPassword || undefined,
          p_plan_key: approval.planKey,
          p_max_user_limit: limitNum,
        });
        if (rpcErr) throw rpcErr;
        setMessage(`تم اعتماد طلب شركة «${activeApproval.company_name}» بنجاح وتعيين خطة ${PLAN_TIERS[approval.planKey]?.name || approval.planKey}.`);
        setActiveApproval(null);
        await load();
        setSubmitting(false);
        return;
      }
    } catch {
      // fallback to API
    }

    try {
      await requestApi(`/api/platform/company-requests/${activeApproval.id}/approve`, {
        companySlug: approval.companySlug.trim(),
        managerFullName: approval.managerFullName.trim(),
        managerEmail: approval.managerEmail.trim(),
        managerPassword: approval.managerPassword || undefined,
        planKey: approval.planKey,
        maxUserLimit: limitNum,
      });
      setMessage(`تم اعتماد طلب شركة «${activeApproval.company_name}» بنجاح.`);
      setActiveApproval(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر اعتماد الطلب.");
    }
    setSubmitting(false);
  };

  const submitReview = async (decision: "approved" | "rejected") => {
    if (!reviewRequest) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestApi(`/api/platform/company-requests/${reviewRequest.id}/review`, {
        decision,
        reviewNote: reviewNote.trim() || undefined,
      });
      setMessage(decision === "approved" ? "تمت الموافقة المبدئية على الطلب." : "تم رفض الطلب.");
      setReviewRequest(null);
      setReviewNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر مراجعة الطلب.");
    }
    setSubmitting(false);
  };

  const submitInfoRequest = async () => {
    if (!infoRequest || !infoNote.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestApi(`/api/platform/company-requests/${infoRequest.id}/request-info`, {
        requestedInfo: infoNote.trim(),
      });
      setMessage("تم إرسال طلب المعلومات الإضافية إلى مقدم الطلب.");
      setInfoRequest(null);
      setInfoNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إرسال طلب المعلومات.");
    }
    setSubmitting(false);
  };

  const resendInvitation = async (req: CompanyRequest) => {
    setSubmitting(true);
    setError(null);
    try {
      await requestApi(`/api/platform/company-requests/${req.id}/resend-invitation`, {});
      setMessage(`تمت إعادة إرسال رابط تفعيل الحساب إلى ${req.contact_email}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إعادة إرسال الدعوة.");
    }
    setSubmitting(false);
  };

  const cancelInvitation = async (req: CompanyRequest) => {
    setSubmitting(true);
    setError(null);
    try {
      await requestApi(`/api/platform/company-requests/${req.id}/cancel-invitation`, {});
      setMessage(`تم إلغاء الدعوة المعلقة لشركة ${req.company_name}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إلغاء الدعوة.");
    }
    setSubmitting(false);
  };

  const startEditPlan = (company: Company) => {
    setEditingCompanyPlan(company);
    setSelectedPlanKey(company.plan_key || "standard");
    setCustomUserLimit(String(company.max_user_limit || PLAN_TIERS[company.plan_key]?.defaultLimit || 20));
  };

  const saveCompanyPlanAndLimit = async () => {
    if (!editingCompanyPlan) return;
    setSubmitting(true);
    setError(null);

    const limitNum = Number.parseInt(customUserLimit, 10);
    if (!limitNum || limitNum < 1) {
      setError("الرجاء إدخال حد مستخدمين صحيح (أكبر من 0).");
      setSubmitting(false);
      return;
    }

    try {
      if (supabase) {
        const { error: rpcErr } = await supabase.rpc("tips_crm_update_company_plan_limit", {
          p_company_id: editingCompanyPlan.id,
          p_plan_key: selectedPlanKey,
          p_max_user_limit: limitNum,
        });
        if (rpcErr) throw rpcErr;
        setMessage(`تم تحديث باقة «${editingCompanyPlan.name}» إلى ${PLAN_TIERS[selectedPlanKey]?.name} بحد ${limitNum} مستخدم.`);
        setEditingCompanyPlan(null);
        await load();
        setSubmitting(false);
        return;
      }
    } catch (rpcErr) {
      try {
        await requestApi(`/api/platform/companies/${editingCompanyPlan.id}/plan-limit`, {
          planKey: selectedPlanKey,
          maxUserLimit: limitNum,
        });
        setMessage(`تم تحديث باقة «${editingCompanyPlan.name}» بنجاح.`);
        setEditingCompanyPlan(null);
        await load();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "تعذر تحديث الباقة والحدود.");
      }
    }
    setSubmitting(false);
  };

  const toggleCompanyStatus = async (company: Company) => {
    const newStatus = company.status === "active" ? "suspended" : "active";
    setSubmitting(true);
    setError(null);
    try {
      if (supabase) {
        await supabase.schema("tips_crm").from("companies").update({
          status: newStatus,
        }).eq("id", company.id);
        setMessage(`تم تغيير حالة شركة «${company.name}» إلى (${newStatus === "active" ? "نشطة" : "موقوفة"}).`);
        await load();
      }
    } catch {
      setError("تعذر تحديث حالة الشركة.");
    }
    setSubmitting(false);
  };

  const createDirect = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await requestApi("/api/platform/companies", {
        ...direct,
        expectedUserCount: Number.parseInt(direct.expectedUserCount, 10) || 20,
      });
      setMessage(`تم إنشاء «${direct.companyName}» وحساب مديرها الأول بنجاح.`);
      setDirect({
        companyName: "",
        companySlug: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        expectedUserCount: "20",
        notes: "",
        managerFullName: "",
        managerEmail: "",
        managerPassword: "",
        planKey: "standard",
      });
      setActiveTab("companies");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إنشاء الشركة.");
    }
    setSubmitting(false);
  };

  const pendingRequests = useMemo(
    () => requests.filter((r) => ["submitted", "awaiting_info"].includes(r.status)),
    [requests]
  );
  const pendingInvitations = useMemo(
    () => requests.filter((r) => ["approved", "invitation_sent"].includes(r.status)),
    [requests]
  );

  const filteredCompanies = useMemo(() => {
    let result = companies;
    if (companyStatusFilter !== "all") {
      result = result.filter((c) => c.status === companyStatusFilter);
    }
    if (companySearch.trim()) {
      const term = companySearch.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.slug.toLowerCase().includes(term) ||
          (c.primary_contact_email && c.primary_contact_email.toLowerCase().includes(term))
      );
    }
    return result;
  }, [companies, companySearch, companyStatusFilter]);

  const filteredRequests = useMemo(() => {
    if (requestFilter === "pending") return requests.filter((r) => ["submitted", "awaiting_info"].includes(r.status));
    if (requestFilter === "approved") return requests.filter((r) => ["approved", "invitation_sent", "manager_activated"].includes(r.status));
    if (requestFilter === "rejected") return requests.filter((r) => ["rejected", "cancelled"].includes(r.status));
    return requests;
  }, [requests, requestFilter]);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.locked}>
        <View style={styles.lockIcon}>
          <MaterialIcons name="laptop-mac" size={32} color={palette.primary} />
        </View>
        <Text style={styles.lockedTitle}>بوابة المنصة للويب فقط</Text>
        <Text style={styles.lockedText}>
          إدارة منصة Tips والشركات مخصصة للمتصفح. افتحها من الويب على جهاز الكمبيوتر.
        </Text>
        <PrimaryButton
          label="فتح بوابة المنصة في المتصفح"
          icon="open-in-new"
          onPress={() => void Linking.openURL("https://tipscrm-vevc4ncu.manus.space/platform")}
          style={{ alignSelf: "stretch", marginTop: 20 }}
        />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (loading && !authTimedOut) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={palette.primary} size="large" />
        <Text style={styles.loadingText}>جاري تحميل بوابة المنصة…</Text>
      </View>
    );
  }

  const isPlatformAdmin =
    Boolean(profile?.is_platform_admin) ||
    profile?.role_key === "platform_admin" ||
    profile?.email === "platform.admin@tips-sd.com";

  if (!isPlatformAdmin) return <Redirect href={"/platform/login" as never} />;

  const tabTitles: Record<PlatformTabKey, string> = {
    overview: "لوحة التحكم والتحليلات",
    companies: "إدارة الشركات والاشتراكات",
    requests: "طلبات الانضمام والاعتماد",
    create: "إضافة شركة ومدير مباشرة",
    invitations: "دعوات مدراء الشركات",
  };

  return (
    <PlatformWebShell
      title={tabTitles[activeTab] || "بوابة المنصة"}
      activeTab={activeTab}
      onSelectTab={(tab) => setActiveTab(tab)}
      pendingRequestsCount={pendingRequests.length}
      companiesCount={companies.length}
      pendingInvitationsCount={pendingInvitations.length}
      onRefresh={() => void load()}
      isRefreshing={fetching}
    >
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.wideContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Global Notifications */}
        {message ? (
          <View style={styles.message}>
            <MaterialIcons name="check-circle" size={19} color={palette.success} />
            <Text style={styles.messageText}>{message}</Text>
            <TouchableOpacity onPress={() => setMessage(null)}>
              <MaterialIcons name="close" size={16} color={palette.success} />
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? (
          <View style={styles.error}>
            <MaterialIcons name="error-outline" size={19} color={palette.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <MaterialIcons name="close" size={16} color={palette.error} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ========================================================= */}
        {/* TAB: OVERVIEW */}
        {/* ========================================================= */}
        {activeTab === "overview" && (
          <View style={styles.tabContent}>
            {/* Hero Greeting */}
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <MaterialIcons name="admin-panel-settings" size={28} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, flexShrink: 1, alignItems: "flex-end" }}>
                <Text style={styles.heroTitle}>أهلاً بك، {profile?.full_name || "مدير المنصة الرئيسي"}</Text>
                <Text style={styles.heroText}>
                  التحكم الشامل بجميع الشركات، ترقية الباقات والحدود، اعتماد الشركات الجديدة، ومتابعة تفعيل المدراء.
                </Text>
              </View>
            </View>

            {/* Metrics */}
            <View style={styles.metrics}>
              <MetricCard
                label="الشركات الكلية"
                value={String(companies.length)}
                icon="domain"
                tone="blue"
              />
              <MetricCard
                label="شركات نشطة"
                value={String(companies.filter((c) => c.status === "active").length)}
                icon="check-circle"
                tone="teal"
              />
              <MetricCard
                label="طلبات جديدة"
                value={String(pendingRequests.length)}
                icon="pending-actions"
                tone="amber"
              />
              <MetricCard
                label="دعوات معلقة"
                value={String(pendingInvitations.length)}
                icon="mark-email-unread"
                tone="blue"
              />
            </View>

            {/* Quick Navigation Cards */}
            <View style={styles.quickGrid}>
              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => setActiveTab("companies")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickCardIcon, { backgroundColor: "#E6F4EA" }]}>
                  <MaterialIcons name="domain" size={24} color="#059669" />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.quickCardTitle}>إدارة الشركات والاشتراكات</Text>
                  <Text style={styles.quickCardCopy}>
                    عرض {companies.length} شركة، تخصيص حدود المستخدمين، وترقية الباقات.
                  </Text>
                </View>
                <MaterialIcons name="chevron-left" size={22} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => setActiveTab("requests")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickCardIcon, { backgroundColor: "#FEF3C7" }]}>
                  <MaterialIcons name="pending-actions" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.quickCardTitle}>طلبات الانضمام الجديدة</Text>
                  <Text style={styles.quickCardCopy}>
                    {pendingRequests.length} طلبات بانتظار الاعتماد والمراجعة.
                  </Text>
                </View>
                <MaterialIcons name="chevron-left" size={22} color="#94A3B8" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => setActiveTab("create")}
                activeOpacity={0.8}
              >
                <View style={[styles.quickCardIcon, { backgroundColor: "#EFF6FF" }]}>
                  <MaterialIcons name="add-business" size={24} color="#2563EB" />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.quickCardTitle}>إنشاء شركة ومدير مباشرة</Text>
                  <Text style={styles.quickCardCopy}>
                    تسجيل شركة وتجهيز حساب مديرها الأول بشكل فوري.
                  </Text>
                </View>
                <MaterialIcons name="chevron-left" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Recent Companies Preview */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>أحدث الشركات المسجلة</Text>
              <TouchableOpacity onPress={() => setActiveTab("companies")}>
                <Text style={styles.sectionHeaderAction}>عرض جميع الشركات ({companies.length})</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardList}>
              {companies.slice(0, 4).map((company) => {
                const planInfo = PLAN_TIERS[company.plan_key] || {
                  name: company.plan_key || "standard",
                  badgeColor: palette.primary,
                  defaultLimit: 20,
                };
                return (
                  <View key={company.id} style={styles.companyMiniCard}>
                    <View style={styles.miniCardRight}>
                      <Text style={styles.miniCardTitle}>{company.name}</Text>
                      <Text style={styles.miniCardSlug}>رمز: {company.slug}</Text>
                    </View>
                    <View style={styles.miniCardBadges}>
                      <View style={[styles.planPill, { backgroundColor: `${planInfo.badgeColor}15`, borderColor: planInfo.badgeColor }]}>
                        <Text style={[styles.planPillText, { color: planInfo.badgeColor }]}>{planInfo.name}</Text>
                      </View>
                      <View style={[styles.status, company.status === "active" ? styles.statusActive : styles.statusMuted]}>
                        <Text style={[styles.statusText, company.status === "active" ? styles.statusActiveText : styles.statusMutedText]}>
                          {company.status === "active" ? "نشطة" : "موقوفة"}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB: COMPANIES */}
        {/* ========================================================= */}
        {activeTab === "companies" && (
          <View style={styles.tabContent}>
            {/* Search and Filters Bar */}
            <View style={styles.filterRow}>
              <View style={styles.searchBox}>
                <MaterialIcons name="search" size={20} color="#94A39C" />
                <TextInput
                  value={companySearch}
                  onChangeText={setCompanySearch}
                  placeholder="ابحث عن شركة، رمز، أو بريد إلكتروني..."
                  placeholderTextColor="#94A39C"
                  textAlign="right"
                  style={styles.searchInput}
                />
                {companySearch ? (
                  <TouchableOpacity onPress={() => setCompanySearch("")}>
                    <MaterialIcons name="clear" size={18} color="#94A39C" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Status Filter Buttons */}
              <View style={styles.filterPills}>
                <TouchableOpacity
                  onPress={() => setCompanyStatusFilter("all")}
                  style={[styles.filterPill, companyStatusFilter === "all" && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, companyStatusFilter === "all" && styles.filterPillTextActive]}>
                    الكل ({companies.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCompanyStatusFilter("active")}
                  style={[styles.filterPill, companyStatusFilter === "active" && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, companyStatusFilter === "active" && styles.filterPillTextActive]}>
                    نشطة ({companies.filter((c) => c.status === "active").length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCompanyStatusFilter("suspended")}
                  style={[styles.filterPill, companyStatusFilter === "suspended" && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, companyStatusFilter === "suspended" && styles.filterPillTextActive]}>
                    موقوفة ({companies.filter((c) => c.status === "suspended").length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {filteredCompanies.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons name="domain-disabled" size={36} color={palette.muted} />
                <Text style={styles.emptyTitle}>لا توجد شركات مطابقة</Text>
                <Text style={styles.emptyText}>تأكد من عبارة البحث أو الفلتر، أو أضف شركة جديدة من قائمة «إضافة شركة مباشرة».</Text>
              </View>
            ) : (
              <View style={isWide ? styles.wideGrid : undefined}>
                {filteredCompanies.map((company) => {
                  const planInfo = PLAN_TIERS[company.plan_key] || {
                    name: company.plan_key || "standard",
                    badgeColor: palette.primary,
                    defaultLimit: 20,
                  };
                  const userLimit = company.max_user_limit || planInfo.defaultLimit;

                  return (
                    <View key={company.id} style={[styles.companyCard, isWide && styles.wideCard]}>
                      <View style={styles.cardTop}>
                        <View
                          style={[
                            styles.companyIcon,
                            company.status === "active" ? styles.activeIcon : styles.inactiveIcon,
                          ]}
                        >
                          <MaterialIcons
                            name="domain"
                            size={22}
                            color={company.status === "active" ? palette.success : palette.warning}
                          />
                        </View>
                        <View style={{ flex: 1, flexShrink: 1, alignItems: "flex-end" }}>
                          <View style={styles.titleRow}>
                            <Text style={styles.cardTitle}>{company.name}</Text>
                            <View
                              style={[
                                styles.status,
                                company.status === "active" ? styles.statusActive : styles.statusMuted,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusText,
                                  company.status === "active" ? styles.statusActiveText : styles.statusMutedText,
                                ]}
                              >
                                {company.status === "active" ? "نشطة" : "موقوفة"}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.cardMeta}>الرمز: {company.slug}</Text>
                          <Text style={styles.cardMeta}>
                            تاريخ التسجيل: {dateArabic(company.created_at)}
                          </Text>
                        </View>
                      </View>

                      {/* Plan & Limits Bar */}
                      <View style={styles.planBadgeRow}>
                        <View
                          style={[
                            styles.planPill,
                            { backgroundColor: `${planInfo.badgeColor}15`, borderColor: planInfo.badgeColor },
                          ]}
                        >
                          <MaterialIcons name="stars" size={14} color={planInfo.badgeColor} />
                          <Text style={[styles.planPillText, { color: planInfo.badgeColor }]}>
                            {planInfo.name}
                          </Text>
                        </View>

                        <View style={styles.userLimitPill}>
                          <MaterialIcons name="people" size={14} color="#475569" />
                          <Text style={styles.userLimitPillText}>
                            الحد الأقصى: <Text style={{ fontWeight: "900" }}>{userLimit} مستخدم</Text>
                          </Text>
                        </View>
                      </View>

                      {/* Contact Info */}
                      <View style={styles.companyInfoRow}>
                        <Text style={styles.contact}>
                          المدير: {company.primary_contact_name || company.primary_contact_email || "غير مسجل"}
                        </Text>
                      </View>

                      {/* Company Actions */}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          onPress={() => startEditPlan(company)}
                          style={styles.editPlanButton}
                        >
                          <MaterialIcons name="tune" size={16} color="#FFFFFF" />
                          <Text style={styles.editPlanButtonText}>ترقية الباقة والحدود</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => void toggleCompanyStatus(company)}
                          style={[
                            styles.statusToggleButton,
                            company.status === "active" ? styles.suspendBtn : styles.activateBtn,
                          ]}
                        >
                          <MaterialIcons
                            name={company.status === "active" ? "pause" : "play-arrow"}
                            size={16}
                            color={company.status === "active" ? palette.warning : palette.success}
                          />
                          <Text
                            style={[
                              styles.statusToggleText,
                              { color: company.status === "active" ? palette.warning : palette.success },
                            ]}
                          >
                            {company.status === "active" ? "إيقاف مؤقت" : "تفعيل الشركة"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB: REQUESTS */}
        {/* ========================================================= */}
        {activeTab === "requests" && (
          <View style={styles.tabContent}>
            {/* Request Filter Tabs */}
            <View style={styles.filterPills}>
              {(["all", "pending", "approved", "rejected"] as const).map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setRequestFilter(key)}
                  style={[styles.filterPill, requestFilter === key && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, requestFilter === key && styles.filterPillTextActive]}>
                    {key === "all" && `الكل (${requests.length})`}
                    {key === "pending" && `قيد الانتظار (${pendingRequests.length})`}
                    {key === "approved" && "معتمدة"}
                    {key === "rejected" && "مرفوضة / ملغاة"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredRequests.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons name="inbox" size={36} color={palette.muted} />
                <Text style={styles.emptyTitle}>لا توجد طلبات في هذا القسم</Text>
                <Text style={styles.emptyText}>ستظهر طلبات انضمام الشركات الجديدة المقدمة عبر البوابة العامة هنا.</Text>
              </View>
            ) : (
              <View style={isWide ? styles.wideGrid : undefined}>
                {filteredRequests.map((req) => {
                  const isExpanded = expandedRequest === req.id;
                  const reqNotes = notesByRequest[req.id] || [];

                  return (
                    <View key={req.id} style={[styles.requestCard, isWide && styles.wideCard]}>
                      <View style={styles.cardTop}>
                        <View style={styles.requestIcon}>
                          <MaterialIcons name="apartment" size={22} color={palette.primary} />
                        </View>
                        <View style={{ flex: 1, flexShrink: 1, alignItems: "flex-end" }}>
                          <View style={styles.titleRow}>
                            <Text style={styles.cardTitle}>{req.company_name}</Text>
                            <View style={[styles.status, { backgroundColor: `${requestStatusColor(req.status)}18` }]}>
                              <Text style={[styles.statusText, { color: requestStatusColor(req.status) }]}>
                                {requestStatusLabel(req.status)}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.cardMeta}>مقدم الطلب: {req.contact_name}</Text>
                          <Text style={styles.cardMeta}>البريد: {req.contact_email}</Text>
                          {req.contact_phone ? <Text style={styles.cardMeta}>الهاتف: {req.contact_phone}</Text> : null}
                          <Text style={styles.cardMeta}>
                            حجم الفريق المتوقع: {req.expected_user_count || "غير محدد"} مستخدم
                          </Text>
                          <Text style={styles.cardMeta}>تاريخ الطلب: {dateArabic(req.created_at)}</Text>
                        </View>
                      </View>

                      {req.notes ? (
                        <View style={styles.reqNotesBox}>
                          <Text style={styles.reqNotesLabel}>ملاحظات مقدم الطلب:</Text>
                          <Text style={styles.reqNotesText}>{req.notes}</Text>
                        </View>
                      ) : null}

                      {/* Request Action Buttons */}
                      <View style={styles.requestActionsGrid}>
                        {["submitted", "awaiting_info"].includes(req.status) && (
                          <>
                            <TouchableOpacity
                              onPress={() => startApproval(req)}
                              style={styles.btnApprove}
                            >
                              <MaterialIcons name="check-circle" size={16} color="#FFFFFF" />
                              <Text style={styles.btnApproveText}>اعتماد وتجهيز الحساب</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => {
                                setInfoRequest(req);
                                setInfoNote("");
                              }}
                              style={styles.btnInfo}
                            >
                              <MaterialIcons name="contact-support" size={16} color={palette.warning} />
                              <Text style={styles.btnInfoText}>طلب تفاصيل</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => {
                                setReviewRequest(req);
                                setReviewNote("");
                              }}
                              style={styles.btnReject}
                            >
                              <MaterialIcons name="cancel" size={16} color={palette.error} />
                              <Text style={styles.btnRejectText}>رفض الطلب</Text>
                            </TouchableOpacity>
                          </>
                        )}

                        {["approved", "invitation_sent"].includes(req.status) && (
                          <>
                            <TouchableOpacity
                              onPress={() => void resendInvitation(req)}
                              style={styles.btnResend}
                            >
                              <MaterialIcons name="send" size={16} color={palette.primary} />
                              <Text style={styles.btnResendText}>إعادة إرسال الدعوة</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => void cancelInvitation(req)}
                              style={styles.btnCancel}
                            >
                              <MaterialIcons name="block" size={16} color={palette.error} />
                              <Text style={styles.btnCancelText}>إلغاء الدعوة</Text>
                            </TouchableOpacity>
                          </>
                        )}

                        {/* Internal Notes Toggle */}
                        <TouchableOpacity
                          onPress={() => {
                            if (isExpanded) {
                              setExpandedRequest(null);
                            } else {
                              setExpandedRequest(req.id);
                              void loadNotes(req.id);
                            }
                          }}
                          style={styles.btnNotesToggle}
                        >
                          <MaterialIcons name="comment" size={16} color="#475569" />
                          <Text style={styles.btnNotesToggleText}>
                            {isExpanded ? "إخفاء الملاحظات" : "ملاحظات وتدقيق"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Internal Notes Section */}
                      {isExpanded && (
                        <View style={styles.notesSection}>
                          <Text style={styles.notesTitle}>سجل الملاحظات الداخلية:</Text>
                          {reqNotes.length === 0 ? (
                            <Text style={styles.noNotes}>لا توجد ملاحظات داخلية بعد.</Text>
                          ) : (
                            reqNotes.map((n) => (
                              <View key={n.id} style={styles.noteItem}>
                                <Text style={styles.noteAuthor}>{n.created_by_name || "مدير المنصة"} · {dateArabic(n.created_at)}</Text>
                                <Text style={styles.noteText}>{n.note_text}</Text>
                              </View>
                            ))
                          )}
                          <View style={styles.addNoteRow}>
                            <TextInput
                              value={noteDraft}
                              onChangeText={setNoteDraft}
                              placeholder="أضف ملاحظة داخلية جديدة..."
                              placeholderTextColor="#94A39C"
                              textAlign="right"
                              style={styles.noteInput}
                            />
                            <TouchableOpacity onPress={() => void addNote(req.id)} style={styles.addNoteBtn}>
                              <Text style={styles.addNoteBtnText}>إضافة</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB: INVITATIONS */}
        {/* ========================================================= */}
        {activeTab === "invitations" && (
          <View style={styles.tabContent}>
            {pendingInvitations.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons name="mark-email-read" size={36} color={palette.muted} />
                <Text style={styles.emptyTitle}>لا توجد دعوات مدراء معلقة</Text>
                <Text style={styles.emptyText}>جميع الشركات المعتمدة قام مدرائها بتفعيل الحسابات وتعيين كلمات المرور.</Text>
              </View>
            ) : (
              <View style={isWide ? styles.wideGrid : undefined}>
                {pendingInvitations.map((req) => (
                  <View key={req.id} style={[styles.companyCard, isWide && styles.wideCard]}>
                    <View style={styles.cardTop}>
                      <View style={[styles.companyIcon, { backgroundColor: "#EFF6FF" }]}>
                        <MaterialIcons name="mail-outline" size={22} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1, flexShrink: 1, alignItems: "flex-end" }}>
                        <Text style={styles.cardTitle}>{req.company_name}</Text>
                        <Text style={styles.cardMeta}>المدير المدعو: {req.contact_name}</Text>
                        <Text style={styles.cardMeta}>البريد: {req.contact_email}</Text>
                        <Text style={styles.cardMeta}>أُرسلت في: {dateArabic(req.invitation_sent_at || req.created_at)}</Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity onPress={() => void resendInvitation(req)} style={styles.btnResend}>
                        <MaterialIcons name="send" size={16} color={palette.primary} />
                        <Text style={styles.btnResendText}>إعادة إرسال الدعوة</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => void cancelInvitation(req)} style={styles.btnCancel}>
                        <MaterialIcons name="cancel" size={16} color={palette.error} />
                        <Text style={styles.btnCancelText}>إلغاء الدعوة</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================= */}
        {/* TAB: DIRECT CREATE */}
        {/* ========================================================= */}
        {activeTab === "create" && (
          <View style={styles.tabContent}>
            <View style={styles.createCard}>
              <View style={styles.formHeader}>
                <MaterialIcons name="add-business" size={24} color={palette.primary} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.formTitle}>تسجيل شركة جديدة وحساب مديرها</Text>
                  <Text style={styles.formSubtitle}>
                    سيتم إنشاء الشركة فوراً وتعيين الباقة وحساب المدير الأول لتتمكن من مباشرة العمل دون انتظار طلب خارجي.
                  </Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>اسم الشركة *</Text>
              <TextInput
                value={direct.companyName}
                onChangeText={(v) =>
                  setDirect((prev) => ({
                    ...prev,
                    companyName: v,
                    companySlug: prev.companySlug || slugFromCompanyName(v),
                  }))
                }
                placeholder="مثال: شركة النيل المتقدمة للتوزيع"
                placeholderTextColor="#94A39C"
                textAlign="right"
                style={styles.fieldInput}
              />

              <Text style={styles.fieldLabel}>رمز الشركة الفريد (Slug) *</Text>
              <TextInput
                value={direct.companySlug}
                onChangeText={(v) => setDirect((prev) => ({ ...prev, companySlug: v }))}
                placeholder="nile-distribution"
                placeholderTextColor="#94A39C"
                autoCapitalize="none"
                textAlign="left"
                style={styles.fieldInput}
              />

              <View style={styles.rowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>بريد مسؤول التواصل</Text>
                  <TextInput
                    value={direct.contactEmail}
                    onChangeText={(v) => setDirect((prev) => ({ ...prev, contactEmail: v }))}
                    placeholder="contact@company.sd"
                    placeholderTextColor="#94A39C"
                    autoCapitalize="none"
                    textAlign="left"
                    style={styles.fieldInput}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>اسم مسؤول التواصل</Text>
                  <TextInput
                    value={direct.contactName}
                    onChangeText={(v) => setDirect((prev) => ({ ...prev, contactName: v }))}
                    placeholder="محمد عثمان"
                    placeholderTextColor="#94A39C"
                    textAlign="right"
                    style={styles.fieldInput}
                  />
                </View>
              </View>

              {/* Plan Picker */}
              <Text style={styles.fieldLabel}>باقة الاشتراك المعتمدة *</Text>
              <View style={styles.planSelectionGrid}>
                {Object.entries(PLAN_TIERS).map(([key, info]) => {
                  const isSelected = direct.planKey === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() =>
                        setDirect((prev) => ({
                          ...prev,
                          planKey: key,
                          expectedUserCount: String(info.defaultLimit),
                        }))
                      }
                      style={[
                        styles.planSelectCard,
                        isSelected && { borderColor: info.badgeColor, backgroundColor: `${info.badgeColor}0F` },
                      ]}
                    >
                      <Text style={[styles.planSelectName, isSelected && { color: info.badgeColor, fontWeight: "900" }]}>
                        {info.name}
                      </Text>
                      <Text style={styles.planSelectLimit}>افتراضي: {info.defaultLimit} مستخدم</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>حد المستخدمين والموظفين المخصص</Text>
              <TextInput
                value={direct.expectedUserCount}
                onChangeText={(v) => setDirect((prev) => ({ ...prev, expectedUserCount: v }))}
                placeholder="20"
                placeholderTextColor="#94A39C"
                keyboardType="numeric"
                textAlign="right"
                style={styles.fieldInput}
              />

              <View style={styles.divider} />

              <Text style={styles.sectionSubTitle}>بيانات حساب المدير الأول للشركة</Text>

              <Text style={styles.fieldLabel}>الاسم الكامل للمدير *</Text>
              <TextInput
                value={direct.managerFullName}
                onChangeText={(v) => setDirect((prev) => ({ ...prev, managerFullName: v }))}
                placeholder="أحمد علي"
                placeholderTextColor="#94A39C"
                textAlign="right"
                style={styles.fieldInput}
              />

              <Text style={styles.fieldLabel}>البريد الإلكتروني لتسجيل الدخول *</Text>
              <TextInput
                value={direct.managerEmail}
                onChangeText={(v) => setDirect((prev) => ({ ...prev, managerEmail: v }))}
                placeholder="manager@company.sd"
                placeholderTextColor="#94A39C"
                autoCapitalize="none"
                textAlign="left"
                style={styles.fieldInput}
              />

              <Text style={styles.fieldLabel}>كلمة المرور الأولية (اختياري)</Text>
              <TextInput
                value={direct.managerPassword}
                onChangeText={(v) => setDirect((prev) => ({ ...prev, managerPassword: v }))}
                placeholder="اتركه فارغاً لإرسال دعوة تفعيل بالبريد"
                placeholderTextColor="#94A39C"
                secureTextEntry
                textAlign="right"
                style={styles.fieldInput}
              />

              <TouchableOpacity
                disabled={submitting || !direct.companyName.trim() || !direct.companySlug.trim() || !direct.managerEmail.trim()}
                onPress={() => void createDirect()}
                style={[
                  styles.submitBtn,
                  (submitting || !direct.companyName.trim() || !direct.companySlug.trim() || !direct.managerEmail.trim()) && { opacity: 0.6 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={20} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>إنشاء الشركة وحساب المدير الآن</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ========================================================= */}
      {/* MODAL: EDIT COMPANY PLAN & LIMITS */}
      {/* ========================================================= */}
      {editingCompanyPlan && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditingCompanyPlan(null)}>
                <MaterialIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={styles.modalTitle}>ترقية الباقة وتعديل الحدود</Text>
                <Text style={styles.modalSubtitle}>شركة: {editingCompanyPlan.name}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>اختر الباقة المناسبة</Text>
            <View style={styles.planSelectionGrid}>
              {Object.entries(PLAN_TIERS).map(([key, info]) => {
                const isSelected = selectedPlanKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      setSelectedPlanKey(key);
                      setCustomUserLimit(String(info.defaultLimit));
                    }}
                    style={[
                      styles.planSelectCard,
                      isSelected && { borderColor: info.badgeColor, backgroundColor: `${info.badgeColor}0F` },
                    ]}
                  >
                    <Text style={[styles.planSelectName, isSelected && { color: info.badgeColor, fontWeight: "900" }]}>
                      {info.name}
                    </Text>
                    <Text style={styles.planSelectLimit}>افتراضي: {info.defaultLimit} مستخدم</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>الحد الأقصى للمستخدمين والموظفين</Text>
            <TextInput
              value={customUserLimit}
              onChangeText={setCustomUserLimit}
              placeholder="20"
              placeholderTextColor="#94A39C"
              keyboardType="numeric"
              textAlign="right"
              style={styles.fieldInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditingCompanyPlan(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={submitting}
                onPress={() => void saveCompanyPlanAndLimit()}
                style={[styles.modalConfirmBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>حفظ التغييرات</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ========================================================= */}
      {/* MODAL: APPROVE REQUEST */}
      {/* ========================================================= */}
      {activeApproval && (
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScrollContainer}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setActiveApproval(null)}>
                  <MaterialIcons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.modalTitle}>اعتماد طلب انضمام شركة</Text>
                  <Text style={styles.modalSubtitle}>شركة: {activeApproval.company_name}</Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>رمز الشركة (Slug) *</Text>
              <TextInput
                value={approval.companySlug}
                onChangeText={(v) => setApproval((prev) => ({ ...prev, companySlug: v }))}
                style={styles.fieldInput}
                autoCapitalize="none"
                textAlign="left"
              />

              <Text style={styles.fieldLabel}>اسم المدير الكامل *</Text>
              <TextInput
                value={approval.managerFullName}
                onChangeText={(v) => setApproval((prev) => ({ ...prev, managerFullName: v }))}
                style={styles.fieldInput}
                textAlign="right"
              />

              <Text style={styles.fieldLabel}>البريد الإلكتروني للمدير *</Text>
              <TextInput
                value={approval.managerEmail}
                onChangeText={(v) => setApproval((prev) => ({ ...prev, managerEmail: v }))}
                style={styles.fieldInput}
                autoCapitalize="none"
                textAlign="left"
              />

              <Text style={styles.fieldLabel}>باقة الاشتراك المعتمدة</Text>
              <View style={styles.planSelectionGrid}>
                {Object.entries(PLAN_TIERS).map(([key, info]) => {
                  const isSelected = approval.planKey === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() =>
                        setApproval((prev) => ({
                          ...prev,
                          planKey: key,
                          maxUserLimit: String(info.defaultLimit),
                        }))
                      }
                      style={[
                        styles.planSelectCard,
                        isSelected && { borderColor: info.badgeColor, backgroundColor: `${info.badgeColor}0F` },
                      ]}
                    >
                      <Text style={[styles.planSelectName, isSelected && { color: info.badgeColor, fontWeight: "900" }]}>
                        {info.name}
                      </Text>
                      <Text style={styles.planSelectLimit}>{info.defaultLimit} مستخدم</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>الحد الأقصى لعدد المستخدمين</Text>
              <TextInput
                value={approval.maxUserLimit}
                onChangeText={(v) => setApproval((prev) => ({ ...prev, maxUserLimit: v }))}
                style={styles.fieldInput}
                keyboardType="numeric"
                textAlign="right"
              />

              <Text style={styles.fieldLabel}>تعيين كلمة مرور مؤقتة (اختياري)</Text>
              <TextInput
                value={approval.managerPassword}
                onChangeText={(v) => setApproval((prev) => ({ ...prev, managerPassword: v }))}
                placeholder="اتركه فارغاً لإرسال رابط تعيين كلمة المرور للمدير"
                placeholderTextColor="#94A39C"
                style={styles.fieldInput}
                secureTextEntry
                textAlign="right"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setActiveApproval(null)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={submitting}
                  onPress={() => void submitApproval()}
                  style={[styles.modalConfirmBtn, submitting && { opacity: 0.6 }]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmBtnText}>تأكيد الاعتماد</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ========================================================= */}
      {/* MODAL: REQUEST INFO */}
      {/* ========================================================= */}
      {infoRequest && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setInfoRequest(null)}>
                <MaterialIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={styles.modalTitle}>طلب معلومات إضافية</Text>
                <Text style={styles.modalSubtitle}>شركة: {infoRequest.company_name}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>المعلومات أو الوثائق المطلوبة من الشركة *</Text>
            <TextInput
              value={infoNote}
              onChangeText={setInfoNote}
              placeholder="اكتب الاستفسار أو الوثائق المطلوبة هنا..."
              placeholderTextColor="#94A39C"
              multiline
              numberOfLines={4}
              textAlign="right"
              style={[styles.fieldInput, { height: 100, textAlignVertical: "top" }]}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setInfoRequest(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={submitting || !infoNote.trim()}
                onPress={() => void submitInfoRequest()}
                style={[styles.modalConfirmBtn, (submitting || !infoNote.trim()) && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>إرسال الطلب</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ========================================================= */}
      {/* MODAL: REJECT REQUEST */}
      {/* ========================================================= */}
      {reviewRequest && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setReviewRequest(null)}>
                <MaterialIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={styles.modalTitle}>تأكيد رفض طلب الشركة</Text>
                <Text style={styles.modalSubtitle}>شركة: {reviewRequest.company_name}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>سبب الرفض (اختياري)</Text>
            <TextInput
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder="اكتب سبب الرفض أو التوضيح..."
              placeholderTextColor="#94A39C"
              multiline
              numberOfLines={3}
              textAlign="right"
              style={[styles.fieldInput, { height: 80, textAlignVertical: "top" }]}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setReviewRequest(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={submitting}
                onPress={() => void submitReview("rejected")}
                style={[styles.modalDangerBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalDangerBtnText}>تأكيد الرفض</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </PlatformWebShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  wideContent: {
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  tabContent: {
    gap: 18,
  },

  // Hero Greeting
  hero: {
    backgroundColor: palette.primary,
    borderRadius: 20,
    padding: 22,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
  },
  heroText: {
    color: "#D1FAE5",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    textAlign: "right",
  },

  // Metrics
  metrics: {
    flexDirection: "row-reverse",
    gap: 12,
    flexWrap: "wrap",
  },

  // Quick Navigation Cards
  quickGrid: {
    flexDirection: "row-reverse",
    gap: 14,
    flexWrap: "wrap",
  },
  quickCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  quickCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickCardTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
  },
  quickCardCopy: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
  },

  // Section Header
  sectionHeaderRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  sectionHeaderTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right",
  },
  sectionHeaderAction: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  // Card List
  cardList: {
    gap: 10,
  },
  companyMiniCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniCardRight: {
    alignItems: "flex-end",
  },
  miniCardTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  miniCardSlug: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },
  miniCardBadges: {
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center",
  },

  // Filter Row
  filterRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
  },
  filterPills: {
    flexDirection: "row-reverse",
    gap: 8,
    flexWrap: "wrap",
  },
  filterPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  filterPillActive: {
    backgroundColor: "#064E3B",
    borderColor: "#064E3B",
  },
  filterPillText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  // Grid
  wideGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 16,
  },
  wideCard: {
    width: "48.8%",
  },

  // Company Card
  companyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 12,
  },
  companyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activeIcon: {
    backgroundColor: "#E6F4EA",
  },
  inactiveIcon: {
    backgroundColor: "#FEF3C7",
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  cardTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right",
  },
  cardMeta: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
    textAlign: "right",
  },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
  },
  statusActive: {
    backgroundColor: "#E6F4EA",
  },
  statusActiveText: {
    color: "#059669",
  },
  statusMuted: {
    backgroundColor: "#F1F5F9",
  },
  statusMutedText: {
    color: "#64748B",
  },

  planBadgeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
  },
  planPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  planPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  userLimitPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  userLimitPillText: {
    color: "#475569",
    fontSize: 11,
  },
  companyInfoRow: {
    alignItems: "flex-end",
  },
  contact: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },

  cardActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  editPlanButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: palette.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  editPlanButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  statusToggleButton: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
  },
  suspendBtn: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  activateBtn: {
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: "800",
  },

  // Request Card
  requestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  requestIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F0FDF8",
    alignItems: "center",
    justifyContent: "center",
  },
  reqNotesBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    alignItems: "flex-end",
  },
  reqNotesLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
  },
  reqNotesText: {
    color: "#1E293B",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  requestActionsGrid: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  btnApprove: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: palette.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  btnApproveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  btnInfo: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  btnInfoText: {
    color: palette.warning,
    fontSize: 11,
    fontWeight: "800",
  },
  btnReject: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  btnRejectText: {
    color: palette.error,
    fontSize: 11,
    fontWeight: "800",
  },
  btnResend: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F0FDF8",
    borderWidth: 1,
    borderColor: "#CCEBE2",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  btnResendText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  btnCancel: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  btnCancelText: {
    color: palette.error,
    fontSize: 11,
    fontWeight: "800",
  },
  btnNotesToggle: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  btnNotesToggleText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },

  // Notes Section
  notesSection: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  notesTitle: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
  noNotes: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "right",
  },
  noteItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "flex-end",
  },
  noteAuthor: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },
  noteText: {
    color: "#1E293B",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  addNoteRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 4,
  },
  noteInput: {
    flex: 1,
    height: 36,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    fontSize: 12,
  },
  addNoteBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  addNoteBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  // Direct Create Card
  createCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
    maxWidth: 760,
    alignSelf: "center",
    width: "100%",
  },
  formHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 14,
  },
  formTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  formSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 6,
  },
  fieldInput: {
    height: 44,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    color: "#0F172A",
    fontSize: 13,
  },
  rowTwo: {
    flexDirection: "row-reverse",
    gap: 12,
  },
  planSelectionGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  planSelectCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 10,
    alignItems: "flex-end",
  },
  planSelectName: {
    color: "#1E293B",
    fontSize: 12,
    fontWeight: "700",
  },
  planSelectLimit: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
  },
  sectionSubTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
  },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  // Modal
  modalBackdrop: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 20,
  },
  modalScrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    maxWidth: 540,
    width: "100%",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 12,
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  modalSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  modalActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  modalCancelBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelBtnText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  modalDangerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: palette.error,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDangerBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  // Alerts
  message: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  messageText: {
    flex: 1,
    color: "#065F46",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  error: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },

  // Empty state
  empty: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 10,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
    maxWidth: 400,
  },

  // Loading & Locked
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7F6",
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 12,
  },
  locked: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    backgroundColor: "#F4F7F6",
  },
  lockIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 16,
  },
  lockedText: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
    lineHeight: 20,
  },
});
