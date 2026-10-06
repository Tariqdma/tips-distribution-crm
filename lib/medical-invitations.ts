import { supabase } from "@/lib/supabase-client";

type RemoteInvitationRow = {
  id: string;
  event_id: string;
  account_id: string | null;
  invitation_status: string;
  notes: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  account_name: string | null;
  account_specialty: string | null;
};

/** Same shape the screens used when they read the table directly (nested event and account). */
export type MedicalInvitation = {
  id: string;
  event_id: string;
  account_id: string | null;
  invitation_status: string;
  notes: string | null;
  medical_events: { title: string | null; starts_at: string | null } | null;
  accounts: { name: string | null; specialty: string | null } | null;
};

export function invitationFromRow(row: RemoteInvitationRow): MedicalInvitation {
  return {
    id: row.id,
    event_id: row.event_id,
    account_id: row.account_id,
    invitation_status: row.invitation_status,
    notes: row.notes,
    medical_events: { title: row.event_title, starts_at: row.event_starts_at },
    accounts: row.account_id ? { name: row.account_name, specialty: row.account_specialty } : null,
  };
}

/** Invitations the caller may see; optionally for one event. */
export async function listMedicalInvitations(eventId?: string) {
  if (!supabase) return { data: [] as MedicalInvitation[], error: null };
  const { data, error } = await supabase.rpc("tips_crm_list_medical_event_invitations", { target_event_id: eventId ?? null });
  return { data: ((data ?? []) as RemoteInvitationRow[]).map(invitationFromRow), error };
}
