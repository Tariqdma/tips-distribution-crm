-- Restores the company-setup RPCs expected by the mobile and web clients.
-- Both functions resolve the active company strictly from auth.uid(), never
-- from a client-provided company identifier.

create or replace function public.tips_crm_get_company_operational_setup()
returns table (
  company_id uuid,
  company_name text,
  legal_name text,
  activity_type text,
  business_phone text,
  support_email text,
  timezone text,
  working_days text[],
  workday_starts_at time,
  workday_ends_at time,
  gps_tracking_required boolean,
  outside_visit_tracking boolean,
  geofence_enforcement boolean,
  is_setup_complete boolean,
  completed_at timestamptz,
  territory_count integer,
  team_member_count integer,
  account_count integer
)
language plpgsql
security definer
set search_path = tips_crm, public, auth
as $$
declare
  actor_profile_id uuid;
  actor_company_id uuid;
begin
  select profile.id, profile.active_company_id
    into actor_profile_id, actor_company_id
  from tips_crm.profiles as profile
  where profile.id = auth.uid()
    and profile.is_active;

  if actor_profile_id is null or actor_company_id is null then
    raise exception 'حساب مدير الشركة أو الشركة النشطة غير موجودة.';
  end if;

  if not exists (
    select 1
    from tips_crm.company_memberships as membership
    where membership.profile_id = actor_profile_id
      and membership.company_id = actor_company_id
      and membership.is_active
      and membership.role_key in ('company_manager', 'sales_manager', 'system_admin')
  ) then
    raise exception 'هذه العملية مخصصة لمدير الشركة فقط.';
  end if;

  return query
  select
    company.id,
    company.name,
    coalesce(settings.legal_name, ''::text),
    coalesce(settings.activity_type, ''::text),
    coalesce(settings.business_phone, ''::text),
    coalesce(settings.support_email, ''::text),
    coalesce(settings.timezone, 'Africa/Khartoum'::text),
    coalesce(settings.working_days, array['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday']::text[]),
    coalesce(settings.workday_starts_at, '08:00'::time),
    coalesce(settings.workday_ends_at, '17:00'::time),
    coalesce(settings.gps_tracking_required, true),
    coalesce(settings.outside_visit_tracking, false),
    coalesce(settings.geofence_enforcement, true),
    coalesce(settings.is_setup_complete, false),
    settings.completed_at,
    (select count(*)::integer from tips_crm.territories as territory where territory.company_id = company.id and territory.is_active),
    (select count(*)::integer from tips_crm.company_memberships as member where member.company_id = company.id and member.is_active),
    (select count(*)::integer from tips_crm.accounts as account where account.company_id = company.id)
  from tips_crm.companies as company
  left join tips_crm.company_operational_settings as settings
    on settings.company_id = company.id
  where company.id = actor_company_id
    and company.status = 'active';

  if not found then
    raise exception 'تعذر تحميل إعدادات الشركة النشطة.';
  end if;
end;
$$;

create or replace function public.tips_crm_save_company_operational_setup(
  input_company_name text,
  input_legal_name text,
  input_activity_type text,
  input_business_phone text,
  input_support_email text,
  input_working_days text[],
  input_workday_starts_at time,
  input_workday_ends_at time,
  input_gps_tracking_required boolean,
  input_outside_visit_tracking boolean,
  input_geofence_enforcement boolean
)
returns table (company_id uuid)
language plpgsql
security definer
set search_path = tips_crm, public, auth
as $$
#variable_conflict use_column
declare
  actor_profile_id uuid;
  actor_company_id uuid;
begin
  select profile.id, profile.active_company_id
    into actor_profile_id, actor_company_id
  from tips_crm.profiles as profile
  where profile.id = auth.uid()
    and profile.is_active;

  if actor_profile_id is null or actor_company_id is null then
    raise exception 'حساب مدير الشركة أو الشركة النشطة غير موجودة.';
  end if;

  if not exists (
    select 1
    from tips_crm.company_memberships as membership
    where membership.profile_id = actor_profile_id
      and membership.company_id = actor_company_id
      and membership.is_active
      and membership.role_key in ('company_manager', 'sales_manager', 'system_admin')
  ) then
    raise exception 'هذه العملية مخصصة لمدير الشركة فقط.';
  end if;

  if coalesce(length(trim(input_company_name)), 0) < 2 then
    raise exception 'اكتب اسم الشركة بصورة صحيحة.';
  end if;
  if coalesce(length(trim(input_activity_type)), 0) < 2 then
    raise exception 'اكتب طبيعة نشاط الشركة.';
  end if;
  if coalesce(cardinality(input_working_days), 0) = 0 then
    raise exception 'اختر يوماً واحداً على الأقل للعمل.';
  end if;
  if input_workday_starts_at is null or input_workday_ends_at is null or input_workday_starts_at >= input_workday_ends_at then
    raise exception 'تحقق من وقت بداية ونهاية الدوام.';
  end if;

  update tips_crm.companies as company
    set name = trim(input_company_name), updated_at = now()
  where company.id = actor_company_id
    and company.status = 'active';

  if not found then
    raise exception 'الشركة النشطة غير متاحة للحفظ.';
  end if;

  insert into tips_crm.company_operational_settings (
    company_id,
    legal_name,
    activity_type,
    business_phone,
    support_email,
    timezone,
    working_days,
    workday_starts_at,
    workday_ends_at,
    gps_tracking_required,
    outside_visit_tracking,
    geofence_enforcement,
    is_setup_complete,
    completed_at,
    updated_at,
    updated_by
  ) values (
    actor_company_id,
    trim(coalesce(input_legal_name, '')),
    trim(input_activity_type),
    nullif(trim(coalesce(input_business_phone, '')), ''),
    nullif(trim(coalesce(input_support_email, '')), ''),
    'Africa/Khartoum',
    input_working_days,
    input_workday_starts_at,
    input_workday_ends_at,
    coalesce(input_gps_tracking_required, true),
    coalesce(input_outside_visit_tracking, false),
    coalesce(input_geofence_enforcement, true),
    true,
    now(),
    now(),
    actor_profile_id
  )
  on conflict (company_id) do update
    set legal_name = excluded.legal_name,
        activity_type = excluded.activity_type,
        business_phone = excluded.business_phone,
        support_email = excluded.support_email,
        timezone = excluded.timezone,
        working_days = excluded.working_days,
        workday_starts_at = excluded.workday_starts_at,
        workday_ends_at = excluded.workday_ends_at,
        gps_tracking_required = excluded.gps_tracking_required,
        outside_visit_tracking = excluded.outside_visit_tracking,
        geofence_enforcement = excluded.geofence_enforcement,
        is_setup_complete = true,
        completed_at = coalesce(tips_crm.company_operational_settings.completed_at, now()),
        updated_at = now(),
        updated_by = actor_profile_id;

  return query select actor_company_id;
end;
$$;

revoke all on function public.tips_crm_get_company_operational_setup() from public;
revoke all on function public.tips_crm_save_company_operational_setup(text, text, text, text, text, text[], time, time, boolean, boolean, boolean) from public;
grant execute on function public.tips_crm_get_company_operational_setup() to authenticated;
grant execute on function public.tips_crm_save_company_operational_setup(text, text, text, text, text, text[], time, time, boolean, boolean, boolean) to authenticated;
