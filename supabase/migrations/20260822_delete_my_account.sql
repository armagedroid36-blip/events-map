-- ============================================================
-- delete_my_account: удаление аккаунта самим пользователем.
-- Вызывается из меню шестерёнки → «Удалить аккаунт» (подтверждение).
--
-- Что удаляется:
--   - профиль (роль, контакты организатора);
--   - история просмотров;
--   - черновики событий (на модерации / отклонённые) этого пользователя;
--   - сам пользователь auth.users (сессия становится недействительной).
--
-- Опубликованные события (status = 'active') остаются на карте:
-- это публичный контент сайта, видимый всем.
--
-- ПРИМЕНЕНИЕ: Supabase SQL Editor или Management API:
--   POST /v1/projects/{REF}/database/query  {"query": "<этот SQL>"}
-- ============================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.history where user_id = uid;
  delete from public.events where owner_id = uid and status <> 'active';
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- Права: только авторизованные пользователи, для себя (auth.uid())
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
