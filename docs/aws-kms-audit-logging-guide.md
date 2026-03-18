# AWS KMS Audit Logging System — Implementation Guide

A guide for implementing a secure key management and audit logging system using AWS KMS, with a focus on compliance and auditability for on-chain applications.

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend   │────▶│  API Routes   │────▶│   AWS KMS    │────▶│  Blockchain  │
│  (Audit UI)  │◀────│  (Auth+Sign)  │◀────│   (HSM)      │     │  (Hedera/EVM)│
└─────────────┘     └──────┬───────┘     └─────────────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │   Database    │
                    │ (Audit Logs)  │
                    │ (Rate Limits) │
                    └──────────────┘
```

**Dual-layer audit:**
1. **Application-level** — Every signing operation is recorded in a database table with full context (user, params, result, IP).
2. **Infrastructure-level** — AWS CloudTrail automatically logs all KMS API calls (`Sign`, `CreateKey`, `GetPublicKey`, `DisableKey`).

---

## 1. Database Schema

### Audit Log Table

```sql
CREATE TABLE kms_signing_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  transaction_type TEXT NOT NULL,
  transaction_id   TEXT,              -- on-chain tx hash/id (null if failed)
  transaction_params JSONB NOT NULL DEFAULT '{}',
  kms_key_id       TEXT NOT NULL,     -- which KMS key was used
  ip_address       TEXT,              -- client IP for forensics
  status           TEXT NOT NULL DEFAULT 'pending',
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT kms_signing_audit_status_check
    CHECK (status IN ('pending', 'success', 'failed')),

  CONSTRAINT kms_signing_audit_transaction_type_check
    CHECK (transaction_type IN (
      'account_create',
      'token_association',
      'token_approval',
      'transfer',
      'bridge',
      -- add your own types here
    ))
);

-- Index for fast user-scoped queries
CREATE INDEX idx_kms_audit_user_created
  ON kms_signing_audit (user_id, created_at DESC);
```

> **Important:** Keep the CHECK constraint on `transaction_type` in sync with your application code. If you add a new operation type in your API but forget to update the constraint, inserts will fail silently (unless you check the error — see step 3).

### Rate Limits Table (optional)

```sql
CREATE TABLE kms_rate_limits (
  user_id           UUID PRIMARY KEY,
  signing_count_1h  INT DEFAULT 0,
  signing_count_24h INT DEFAULT 0,
  last_signing_at   TIMESTAMPTZ,
  last_reset_1h     TIMESTAMPTZ DEFAULT now(),
  last_reset_24h    TIMESTAMPTZ DEFAULT now()
);

-- Atomic increment via RPC function
CREATE OR REPLACE FUNCTION increment_rate_limits(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO kms_rate_limits (user_id, signing_count_1h, signing_count_24h, last_signing_at)
  VALUES (p_user_id, 1, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET
    signing_count_1h = kms_rate_limits.signing_count_1h + 1,
    signing_count_24h = kms_rate_limits.signing_count_24h + 1,
    last_signing_at = now();
END;
$$ LANGUAGE plpgsql;
```

### Row-Level Security (RLS)

```sql
-- Users can only read their own audit logs
ALTER TABLE kms_signing_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs"
  ON kms_signing_audit FOR SELECT
  USING (auth.uid() = user_id);
```

---

## 2. AWS KMS Key Setup

### Create a Signing Key

```typescript
import {
  KMSClient,
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
} from '@aws-sdk/client-kms'

const kms = new KMSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

async function createSigningKey(userId: string) {
  const result = await kms.send(new CreateKeyCommand({
    KeySpec: 'ECC_SECG_P256K1',   // secp256k1 for blockchain compatibility
    KeyUsage: 'SIGN_VERIFY',
    Description: `Signing key for user ${userId}`,
    Tags: [
      { TagKey: 'service', TagValue: 'your-app-name' },
      { TagKey: 'user_id', TagValue: userId },
    ],
  }))

  const keyId = result.KeyMetadata!.KeyId!
  const keyArn = result.KeyMetadata!.Arn!

  // Retrieve the public key
  const pubKeyResult = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }))
  const publicKeyHex = extractRawPublicKey(pubKeyResult.PublicKey!)

  return { keyId, keyArn, publicKeyHex }
}
```

### Sign a Transaction Digest

```typescript
import { keccak256 } from 'js-sha3'

async function signDigest(kmsKeyId: string, digest: Uint8Array): Promise<Uint8Array> {
  const result = await kms.send(new SignCommand({
    KeyId: kmsKeyId,
    Message: digest,
    MessageType: 'DIGEST',             // we pre-hash
    SigningAlgorithm: 'ECDSA_SHA_256',
  }))

  // Convert DER-encoded signature to raw (r, s) format
  // Apply low-S normalization if required by your chain
  return derToRawSignature(result.Signature!)
}
```

### Key Rotation

```typescript
async function rotateKey(userId: string, oldKeyId: string) {
  // 1. Create new key
  const newKey = await createSigningKey(userId)

  // 2. Update the on-chain account key (requires dual signing)
  // ... chain-specific logic ...

  // 3. Disable old key (keep for audit trail — never delete)
  await kms.send(new DisableKeyCommand({ KeyId: oldKeyId }))

  return newKey
}
```

> **Never delete KMS keys.** Disable them instead. Deleted keys destroy the audit trail — a disabled key proves what was used historically while preventing future use.

---

## 3. Audit Recording Function

The core function that every signing route calls:

```typescript
interface SigningContext {
  userId: string
  accountId: string     // on-chain account
  kmsKeyId: string
  publicKeyHex: string
  ip: string | null
}

async function recordSigningOperation(
  ctx: SigningContext,
  txType: string,
  txParams: Record<string, unknown>,
  result: { transactionId?: string; error?: string }
) {
  const { error: insertError } = await db
    .from('kms_signing_audit')
    .insert({
      user_id: ctx.userId,
      transaction_type: txType,
      transaction_id: result.transactionId || null,
      transaction_params: txParams,
      kms_key_id: ctx.kmsKeyId,
      ip_address: ctx.ip,
      status: result.error ? 'failed' : 'success',
      error_message: result.error || null,
    })

  // IMPORTANT: Always check for insert errors
  if (insertError) {
    console.error('Failed to insert audit log:', insertError)
  }

  // Increment rate limit counters (only on success)
  if (!result.error) {
    await db.rpc('increment_rate_limits', { p_user_id: ctx.userId })
  }
}
```

---

## 4. Using Audit Logging in API Routes

### Pattern: Every Signing Route

```typescript
export async function POST(request: Request) {
  let ctx: SigningContext | undefined

  try {
    // 1. Auth + rate limits
    ctx = await validateSigningRequest(request)

    // 2. Parse & validate input
    const body = await request.json()

    // 3. Execute the signing operation
    const transactionId = await signAndExecute(body, ctx)

    // 4. Record SUCCESS — with .catch() so audit failure
    //    never breaks the user response
    await recordSigningOperation(ctx, 'your_tx_type', {
      ...body,  // store relevant params
    }, { transactionId })
      .catch(err => console.warn('Audit log failed:', err))

    return Response.json({ success: true, transactionId })

  } catch (error: any) {
    // 5. Record FAILURE
    if (ctx) {
      await recordSigningOperation(ctx, 'your_tx_type', {}, {
        error: error.message,
      }).catch(() => {})
    }

    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
```

### Key Points

- **Always `.catch()` the success path** — the transaction already executed on-chain. If the audit insert fails, the user should still get a success response.
- **Log both success and failure** — failed attempts are equally important for security auditing.
- **Store transaction params** — knowing *what* was attempted, not just *that* something happened, is critical for forensics.
- **Capture IP address** — extract from `x-forwarded-for` or `x-real-ip` headers.

---

## 5. Request Validation & Rate Limiting

```typescript
async function validateSigningRequest(request: Request): Promise<SigningContext> {
  // 1. Authenticate via JWT
  const user = await getAuthenticatedUser(request)
  if (!user) throw new AuthError('Unauthorized', 401)

  // 2. Verify active account
  const account = await db
    .from('custodial_accounts')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!account || account.status !== 'active') {
    throw new AuthError('No active custodial account', 400)
  }

  // 3. Check rate limits
  const rateLimit = await db
    .from('kms_rate_limits')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (rateLimit) {
    const now = Date.now()

    // Reset hourly counter if window expired
    let count1h = rateLimit.signing_count_1h ?? 0
    if (now - new Date(rateLimit.last_reset_1h).getTime() > 3_600_000) {
      count1h = 0
      await db.from('kms_rate_limits')
        .update({ signing_count_1h: 0, last_reset_1h: new Date().toISOString() })
        .eq('user_id', user.id)
    }

    // Reset daily counter if window expired
    let count24h = rateLimit.signing_count_24h ?? 0
    if (now - new Date(rateLimit.last_reset_24h).getTime() > 86_400_000) {
      count24h = 0
      await db.from('kms_rate_limits')
        .update({ signing_count_24h: 0, last_reset_24h: new Date().toISOString() })
        .eq('user_id', user.id)
    }

    const MAX_PER_HOUR = parseInt(process.env.MAX_TX_PER_HOUR || '10')
    const MAX_PER_DAY = parseInt(process.env.MAX_TX_PER_DAY || '50')

    if (count1h >= MAX_PER_HOUR) throw new AuthError('Rate limit: max per hour exceeded', 429)
    if (count24h >= MAX_PER_DAY) throw new AuthError('Rate limit: max per day exceeded', 429)
  }

  return {
    userId: user.id,
    accountId: account.account_id,
    kmsKeyId: account.kms_key_id,
    publicKeyHex: account.public_key_hex,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
  }
}
```

---

## 6. Audit Log API Endpoint

```typescript
// GET /api/audit-logs?limit=50&offset=0&type=bridge&status=success&dateFrom=2026-01-01&dateTo=2026-12-31
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  let query = db
    .from('kms_signing_audit')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (type) query = query.eq('transaction_type', type)
  if (status) query = query.eq('status', status)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)

  const { data: logs, count, error } = await query.range(offset, offset + limit - 1)

  return Response.json({
    success: true,
    logs: logs || [],
    pagination: { total: count || 0, limit, offset, hasMore: (count || 0) > offset + limit },
  })
}
```

---

## 7. Frontend: Audit Log UI

### Data Fetching Hook

```typescript
const PAGE_SIZE = 20

function useAuditLogs(accessToken: string | undefined) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ type: '', status: '', dateFrom: '', dateTo: '' })
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false })

  const fetchLogs = useCallback(async (offset = 0, append = false) => {
    if (!accessToken) return
    setLoading(true)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (filters.type) params.set('type', filters.type)
    if (filters.status) params.set('status', filters.status)
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) params.set('dateTo', filters.dateTo)

    const res = await fetch(`/api/audit-logs?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()

    setLogs(prev => append ? [...prev, ...data.logs] : data.logs)
    setPagination(data.pagination)
    setLoading(false)
  }, [accessToken, filters])

  useEffect(() => { fetchLogs(0) }, [fetchLogs])

  return { logs, loading, pagination, filters, setFilters, loadMore: () => fetchLogs(pagination.offset + PAGE_SIZE, true), refresh: () => fetchLogs(0) }
}
```

### UI Recommendations

- **Filterable table** with dropdowns for transaction type and status, plus date range inputs
- **Color-coded badges** for transaction types and statuses (green=success, red=failed, yellow=pending)
- **Expandable rows** showing KMS Key ID, transaction parameters (JSON), and error messages
- **Copy buttons** for transaction IDs and KMS Key IDs
- **External links** to blockchain explorers (HashScan, Etherscan, Arbiscan, etc.)
- **Skeleton loading** during data fetch
- **Empty state** when no operations exist yet
- **"Load more" pagination** instead of page numbers for simplicity

---

## 8. AWS CloudTrail (Infrastructure Layer)

CloudTrail automatically logs all KMS API calls. To enable and verify:

1. **Enable CloudTrail** in your AWS account (it's on by default for management events).
2. **Verify** KMS events are captured:
   - `kms:Sign` — every transaction signing
   - `kms:CreateKey` — key creation
   - `kms:GetPublicKey` — public key retrieval
   - `kms:DisableKey` — key rotation/deactivation
   - `kms:DescribeKey` — key status checks
3. **Create a CloudTrail trail** to send logs to S3 for long-term retention.
4. **Optional:** Set up CloudWatch alarms for anomalous KMS usage (e.g., signing rate spikes).

This provides a tamper-proof audit trail independent of your application database.

---

## 9. Security Checklist

- [ ] KMS keys are `ECC_SECG_P256K1` with `SIGN_VERIFY` usage only
- [ ] Private keys **never** leave the KMS HSM
- [ ] All signing routes require JWT authentication
- [ ] Rate limits enforced per user (hourly + daily)
- [ ] Every signing operation recorded (success AND failure)
- [ ] Transaction params stored for forensic analysis
- [ ] Client IP captured from request headers
- [ ] RLS policies restrict audit log access to own records
- [ ] DB CHECK constraints match application transaction types
- [ ] Audit insert errors are logged (not silently ignored)
- [ ] Success path uses `.catch()` to prevent audit failures from breaking user flow
- [ ] CloudTrail enabled for infrastructure-level KMS logging
- [ ] Disabled keys preserved (never deleted) for audit trail
- [ ] Key rotation signs with both old and new keys before disabling old
