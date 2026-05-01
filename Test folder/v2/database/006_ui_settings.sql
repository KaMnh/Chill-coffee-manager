-- Chill Manager v2 - UI settings and checklist editor RPCs

create or replace function public.update_sidebar_defaults(p_role text, p_items text[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_defaults jsonb;
  v_items jsonb;
begin
  if not public.app_is_owner_manager() then
    raise exception 'Bạn không có quyền cập nhật quyền xem trang.';
  end if;
  if p_role not in ('owner','manager','staff_operator','employee_viewer') then
    raise exception 'Role không hợp lệ.';
  end if;
  v_items := coalesce(to_jsonb(p_items), '[]'::jsonb);
  v_defaults := coalesce((select value from public.app_settings where key = 'sidebar_defaults'), '{}'::jsonb);
  v_defaults := jsonb_set(v_defaults, array[p_role], v_items, true);
  insert into public.app_settings (key, value, is_public, updated_by)
  values ('sidebar_defaults', v_defaults, true, auth.uid())
  on conflict (key) do update set value = excluded.value, is_public = true, updated_by = auth.uid(), updated_at = now();
  return v_defaults;
end;
$$;

create or replace function public.update_user_sidebar_config(p_profile_id uuid, p_items text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_value jsonb := case when p_items is null then null else to_jsonb(p_items) end;
begin
  if not public.app_is_owner_manager() then
    raise exception 'Bạn không có quyền cập nhật override nhân viên.';
  end if;
  insert into public.profiles (id, sidebar_config, updated_at)
  values (p_profile_id, v_value, now())
  on conflict (id) do update set sidebar_config = excluded.sidebar_config, updated_at = now();
  return jsonb_build_object('profile_id', p_profile_id, 'sidebar_config', v_value);
end;
$$;

create or replace function public.update_handover_default_tasks(p_tasks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.app_is_owner_manager() then
    raise exception 'Bạn không có quyền cập nhật mẫu checklist.';
  end if;
  if jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' then
    raise exception 'Danh sách checklist không hợp lệ.';
  end if;
  insert into public.app_settings (key, value, is_public, updated_by)
  values ('handover_default_tasks', p_tasks, true, auth.uid())
  on conflict (key) do update set value = excluded.value, is_public = true, updated_by = auth.uid(), updated_at = now();
  return p_tasks;
end;
$$;

create or replace function public.update_handover_session_tasks(p_session_id uuid, p_tasks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_task jsonb;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_sort integer := 10;
  v_key text;
  v_label text;
begin
  if not public.app_is_owner_manager() then
    raise exception 'Bạn không có quyền chỉnh nội dung checklist trong ngày.';
  end if;
  if not exists (select 1 from public.handover_sessions where id = p_session_id) then
    raise exception 'Không tìm thấy checklist trong ngày.';
  end if;
  if jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' then
    raise exception 'Danh sách checklist không hợp lệ.';
  end if;
  for v_task in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    v_label := trim(coalesce(v_task->>'label', ''));
    if v_label = '' then continue; end if;
    v_key := coalesce(nullif(v_task->>'key', ''), 'task_' || v_sort::text);
    v_id := nullif(v_task->>'id', '')::uuid;
    if v_id is not null and exists (select 1 from public.handover_tasks where id = v_id and session_id = p_session_id) then
      update public.handover_tasks set task_key = v_key, label = v_label, sort_order = coalesce((v_task->>'sort_order')::integer, v_sort) where id = v_id and session_id = p_session_id;
    else
      insert into public.handover_tasks (session_id, task_key, label, sort_order)
      values (p_session_id, v_key, v_label, coalesce((v_task->>'sort_order')::integer, v_sort))
      on conflict (session_id, task_key) do update set label = excluded.label, sort_order = excluded.sort_order
      returning id into v_id;
    end if;
    v_keep := array_append(v_keep, v_id);
    v_sort := v_sort + 10;
  end loop;
  delete from public.handover_tasks where session_id = p_session_id and not (id = any(v_keep));
  return public.handover_session_payload(p_session_id);
end;
$$;

grant execute on function public.update_sidebar_defaults(text, text[]) to authenticated;
grant execute on function public.update_user_sidebar_config(uuid, text[]) to authenticated;
grant execute on function public.update_handover_default_tasks(jsonb) to authenticated;
grant execute on function public.update_handover_session_tasks(uuid, jsonb) to authenticated;
