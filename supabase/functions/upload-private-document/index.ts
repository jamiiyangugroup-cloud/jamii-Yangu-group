import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
})
const bucketFor = (category: string) => ({
  NATIONAL_ID_FRONT: 'identity-documents', NATIONAL_ID_BACK: 'identity-documents', PASSPORT: 'identity-documents',
  PROFILE_PHOTO: 'member-kyc', PROOF_OF_RESIDENCE: 'member-kyc', MEMBERSHIP_SUPPORT: 'membership-documents',
  LOAN_SUPPORT: 'loan-documents', RENT_SUPPORT: 'rent-documents', SCHOOL_FEES_SUPPORT: 'school-fees-documents',
  MEDICAL_SUPPORT: 'medical-documents', BUSINESS_SUPPORT: 'business-documents',
} as Record<string, string>)[category]

function keyFromEnv(name: string, fallback?: string) {
  const raw = Deno.env.get(name)
  if (raw) {
    try { return JSON.parse(raw).default as string } catch { return raw }
  }
  return fallback
}

function sniff(bytes: Uint8Array) {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return { mime: 'image/png', ext: 'png' }
  return null
}

Deno.serve(async (request) => {
  const allowedOrigins = [Deno.env.get('APP_ORIGIN'), Deno.env.get('LOCAL_DEV_ORIGIN')].filter(Boolean) as string[]
  const origin = request.headers.get('Origin') ?? ''
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(allowedOrigins.includes(origin) ? origin : 'null') })
  if (!allowedOrigins.includes(origin)) return Response.json({ error: 'Origin is not allowed.' }, { status: 403 })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders(origin) })
  if (Deno.env.get('DOCUMENT_UPLOADS_ENABLED') !== 'true') return Response.json({ error: 'Secure document intake is not enabled.' }, { status: 503, headers: corsHeaders(origin) })

  const headers = corsHeaders(origin)
  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const publishableKey = keyFromEnv('SUPABASE_PUBLISHABLE_KEYS', Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))
  const secretKey = keyFromEnv('SUPABASE_SECRET_KEYS', Deno.env.get('SUPABASE_SECRET_KEY'))
  if (!authorization || !url || !publishableKey || !secretKey) return Response.json({ error: 'Service is not configured.' }, { status: 503, headers })

  const userClient = createClient(url, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: { user }, error: authError } = await userClient.auth.getUser(token)
  if (authError || !user || !user.email_confirmed_at) return Response.json({ error: 'Verified sign-in is required.' }, { status: 401, headers })

  const form = await request.formData()
  const file = form.get('file')
  const category = String(form.get('category') ?? '')
  const applicationId = String(form.get('applicationId') ?? '') || null
  const memberId = String(form.get('memberId') ?? '') || null
  const bucket = bucketFor(category)
  if (!(file instanceof File) || !bucket || Boolean(applicationId) === Boolean(memberId) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'Choose a supported document smaller than 10 MB and a valid application or member record.' }, { status: 400, headers })
  }

  if (applicationId) {
    const { data } = await userClient.from('membership_applications').select('id').eq('id', applicationId).eq('user_id', user.id).maybeSingle()
    if (!data) return Response.json({ error: 'Application is not available to this account.' }, { status: 403, headers })
  } else {
    const { data } = await userClient.from('members').select('id').eq('id', memberId).eq('user_id', user.id).maybeSingle()
    if (!data) return Response.json({ error: 'Membership is not available to this account.' }, { status: 403, headers })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = sniff(bytes)
  if (!detected) return Response.json({ error: 'Only valid PDF, JPEG, and PNG documents are accepted.' }, { status: 415, headers })
  const adminClient = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const path = `${user.id}/${crypto.randomUUID()}.${detected.ext}`
  const { error: uploadError } = await adminClient.storage.from(bucket).upload(path, bytes, { contentType: detected.mime, upsert: false })
  if (uploadError) return Response.json({ error: 'Document upload failed.' }, { status: 500, headers })

  const { data: document, error: insertError } = await adminClient.from('private_documents').insert({
    owner_user_id: user.id, application_id: applicationId, member_id: memberId,
    bucket_id: bucket, object_path: path, category, mime_type: detected.mime, byte_size: bytes.byteLength,
  }).select('id,status,created_at').single()
  if (insertError) {
    await adminClient.storage.from(bucket).remove([path])
    return Response.json({ error: 'Document metadata could not be saved.' }, { status: 500, headers })
  }
  const { error: auditError } = await adminClient.from('audit_logs').insert({ actor_user_id: user.id, action_key: 'document.upload', resource_type: 'private_document', resource_id: document.id, details: { category, bucket_id: bucket } })
  if (auditError) {
    await adminClient.from('private_documents').delete().eq('id', document.id)
    await adminClient.storage.from(bucket).remove([path])
    return Response.json({ error: 'Document upload could not be securely recorded.' }, { status: 503, headers })
  }
  return Response.json(document, { status: 201, headers })
})
