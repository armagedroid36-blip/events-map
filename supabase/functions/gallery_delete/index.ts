// Удаление фото из галереи организатора.
// JWT-сессия обязательна (verify_jwt — деплой БЕЗ --no-verify-jwt): владелец
// определяется по auth.uid() из токена. Storage API не разрешает прямое
// DELETE из storage.objects (42501), поэтому объект удаляется через
// DELETE /storage/v1/object/photos/<path> с service role, запись — через
// REST org_gallery (тоже service role). IP/секреты не логируются.
// env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (автоматически в Edge Functions).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/** Декодировать uid из JWT (payload, base64url) */
function uidFromAuth(auth: string | null): string | null {
  if (!auth) return null;
  const parts = auth.split('.');
  if (parts.length < 2) return null;
  const pad = '='.repeat((4 - (parts[1].length % 4)) % 4);
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/') + pad));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

/** REST-вызов с service role (apikey И Authorization — иначе роль = anon) */
async function rest(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text().catch(() => '') };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const uid = uidFromAuth(req.headers.get('Authorization'));
  if (!uid) return new Response('unauthorized', { status: 401 });

  let pId = '';
  try {
    const body = await req.json();
    pId = String(body?.p_id ?? '');
  } catch {
    /* пустое тело */
  }
  if (!pId) return new Response('p_id required', { status: 400 });

  // 1. Запись: path + владелец (service role обходит RLS)
  const { status, text } = await rest(
    'GET',
    `/rest/v1/org_gallery?id=eq.${encodeURIComponent(pId)}&select=photo_path,org_id`,
  );
  if (status !== 200) return new Response('db error', { status: 500 });
  let rows: { photo_path?: string; org_id?: string }[] = [];
  try {
    rows = JSON.parse(text || '[]');
  } catch {
    rows = [];
  }
  const row = rows[0];
  if (!row?.photo_path) return new Response('not found', { status: 404 });
  if (row.org_id !== uid) return new Response('forbidden', { status: 403 });

  // 2. Объект storage (DELETE через Storage API — прямой SQL-удаление запрещено)
  const obj = await rest('DELETE', `/storage/v1/object/photos/${encodeURIComponent(row.photo_path)}`);
  if (obj.status >= 400) return new Response('storage error', { status: 500 });

  // 3. Запись
  const rec = await rest('DELETE', `/rest/v1/org_gallery?id=eq.${encodeURIComponent(pId)}`);
  if (rec.status >= 400) return new Response('db error', { status: 500 });

  return new Response(null, { status: 204 });
});
