# ⚠️ IMPORTANT: Fix Stripe Key Configuration

## Problem Detected

Your Render environment variable `STRIPE_PUBLISHABLE_KEY` is currently set to a **secret key** (`sk_test_...`) instead of a **publishable key** (`pk_test_...`).

**This is a security issue!** Secret keys should NEVER be exposed to the frontend.

## How to Fix

### 1. Get Your Correct Keys from Stripe

1. Go to [Stripe Dashboard → API Keys](https://dashboard.stripe.com/apikeys)
2. You'll see two keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`) ← Use this for `STRIPE_PUBLISHABLE_KEY`
   - **Secret key** (starts with `sk_test_` or `sk_live_`) ← Use this for `STRIPE_SECRET_KEY`

### 2. Update Render Environment Variables

Go to [Render Dashboard](https://dashboard.render.com) → Your service → Environment:

**Update these variables:**

1. **`STRIPE_PUBLISHABLE_KEY`** = `pk_test_...` (NOT `sk_test_...`)
   - Must start with `pk_test_` (test) or `pk_live_` (production)
   - This is safe to expose to the frontend

2. **`STRIPE_SECRET_KEY`** = `sk_test_...` (keep this as is)
   - Must start with `sk_test_` (test) or `sk_live_` (production)
   - This should NEVER be exposed

### 3. Verify the Fix

After updating, test the endpoint:

```bash
curl https://focus-nudge-extension.onrender.com/api/config
```

**Should return:**
```json
{
  "stripePublishableKey": "pk_test_..."
}
```

**Should NOT return:**
```json
{
  "stripePublishableKey": "sk_test_..."  ← WRONG!
}
```

## Key Differences

| Key Type | Starts With | Used For | Safe to Expose? |
|----------|-------------|----------|-----------------|
| **Publishable** | `pk_test_` or `pk_live_` | Frontend/client-side | ✅ Yes |
| **Secret** | `sk_test_` or `sk_live_` | Backend/server-side only | ❌ **NEVER** |

## Security Note

The backend now validates that `STRIPE_PUBLISHABLE_KEY` starts with `pk_` to prevent accidentally exposing secret keys. If you see an error about "Invalid publishable key format", check your Render environment variables.
