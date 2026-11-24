import { createClient } from 'npm:@supabase/supabase-js@2'

const origins = () => [Deno.env.get('APP_ORIGIN'), Deno.env.get('LOCAL_DEV_ORIGIN')].filter(Boolean) as string[]
const keys = (name: string, fallback?: string) => {
  const raw = Deno.env.get(name)
  if (!raw) return fallback
  try { return JSON.parse(raw).default as string } catch { return raw }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  const headers = { 'Access-Control-Allow-Origin': origins().includes(origin) ? origin : 'null', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (!origins().includes(origin)) return Response.json({ error: 'Origin is not allowed.' }, { status: 403 })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const publishableKey = keys('SUPABASE_PUBLISHABLE_KEYS', Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))
  const secretKey = keys('SUPABASE_SECRET_KEYS', Deno.env.get('SUPABASE_SECRET_KEY'))
  if (!authorization || !url || !publishableKey || !secretKey) return Response.json({ error: 'Service is not configured.' }, { status: 503, headers })
  const userClient = createClient(url, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: { user }, error: authError } = await userClient.auth.getUser(token)
  if (authError || !user || !user.email_confirmed_at) return Response.json({ error: 'Verified sign-in is required.' }, { status: 401, headers })
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'A valid JSON request is required.' }, { status: 400, headers }) }
  const documentId = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).documentId
    : null
  if (typeof documentId !== 'string' || !documentId || documentId.length > 80) return Response.json({ error: 'Document id is required.' }, { status: 400, headers })

  // This query uses the member's JWT and RLS; never accept a bucket/path from the browser.
  const { data: document, error: documentError } = await userClient.from('private_documents')
    .select('id,bucket_id,object_path,category').eq('id', documentId).maybeSingle()
  if (documentError || !document) return Response.json({ error: 'Document is unavailable.' }, { status: 404, headers })

  const adminClient = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await adminClient.storage.from(document.bucket_id).createSignedUrl(document.object_path, 60)
  if (error || !data?.signedUrl) return Response.json({ error: 'Could not create a temporary document link.' }, { status: 500, headers })
  const { error: auditError } = await adminClient.from('audit_logs').insert({ actor_user_id: user.id, action_key: 'document.download_link.created', resource_type: 'private_document', resource_id: document.id, details: { category: document.category, expiry_seconds: 60 } })
  if (auditError) return Response.json({ error: 'Document access could not be securely recorded.' }, { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } })
  return Response.json({ signedUrl: data.signedUrl, expiresIn: 60 }, { headers: { ...headers, 'Cache-Control': 'no-store' } })
})
