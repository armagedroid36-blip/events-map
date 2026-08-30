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

/** CORS на ВСЕХ ответах (включая ошибки — иначе браузер не прочитает их) */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
function json(status: number, msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

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

/** REST-вызов с service role (apikey И Authorization — иначе роль = anon).
 *  Content-Type шлём только при наличии тела: Storage API на DELETE с
 *  application/json и пустым телом отвечает 400 «Body cannot be empty». */
async function rest(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text().catch(() => '') };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return json(405, 'method not allowed');
  }

  const uid = uidFromAuth(req.headers.get('Authorization'));
  if (!uid) return json(401, 'unauthorized');

  let pId = '';
  try {
    const body = await req.json();
    pId = String(body?.p_id ?? '');
  } catch {
    /* пустое тело */
  }
  if (!pId) return json(400, 'p_id required');

  // 1. Запись: path + владелец (service role обходит RLS)
  const { status, text } = await rest(
    'GET',
    `/rest/v1/org_gallery?id=eq.${encodeURIComponent(pId)}&select=photo_path,org_id`,
  );
  if (status !== 200) return json(500, 'db error');
  let rows: { photo_path?: string; org_id?: string }[] = [];
  try {
    rows = JSON.parse(text || '[]');
  } catch {
    rows = [];
  }
  const row = rows[0];
  if (!row?.photo_path) return json(404, 'not found');
  if (row.org_id !== uid) return json(403, 'forbidden');

  // 2. Объект storage (DELETE через Storage API — прямой SQL-удаление запрещено)
  const obj = await rest('DELETE', `/storage/v1/object/photos/${encodeURIComponent(row.photo_path)}`);
  if (obj.status >= 400) return json(500, `storage error ${obj.status}: ${obj.text.slice(0, 150)}`);

  // 3. Запись
  const rec = await rest('DELETE', `/rest/v1/org_gallery?id=eq.${encodeURIComponent(pId)}`);
  if (rec.status >= 400) return json(500, 'db error');

  return new Response(null, { status: 204, headers: CORS });
});
