# Webhook Troubleshooting Guide

## Problem: Payment Recorded but License Not Activated

If you see payment in Stripe but the extension shows "Basic", the webhook isn't working.

## Quick Fix: Manually Create License

Since payment is already recorded, you can manually create the license:

### Step 1: Get Your User ID

1. Open extension Options page
2. Press F12 → Console
3. Run: `chrome.storage.local.get('focusNudgeUserId', (r) => console.log(r.focusNudgeUserId))`
4. Copy the userId (starts with `fn_`)

### Step 2: Get Stripe Customer ID

1. Go to [Stripe Dashboard → Customers](https://dashboard.stripe.com/customers)
2. Find your test payment
3. Click on the customer
4. Copy the Customer ID (starts with `cus_`)

### Step 3: Create License Manually

Open this URL in your browser (replace `YOUR_USER_ID` and `YOUR_CUSTOMER_ID`):

```
https://focus-nudge-extension.onrender.com/api/debug/create-license?userId=YOUR_USER_ID&customerId=YOUR_CUSTOMER_ID
```

Example:
```
https://focus-nudge-extension.onrender.com/api/debug/create-license?userId=fn_meibfhdipbiohpbijholkpdidigmehfc_1234567890&customerId=cus_ABC123
```

### Step 4: Verify License

1. Go back to extension Options page
2. Refresh the page
3. Should now show "Pro"!

## Check Webhook Status

### 1. Verify Webhook is Set Up

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Check if you have an endpoint: `https://focus-nudge-extension.onrender.com/api/webhook`
3. If not, create it:
   - Click "Add endpoint"
   - URL: `https://focus-nudge-extension.onrender.com/api/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the webhook secret (`whsec_...`)

### 2. Check Webhook Secret in Render

1. Go to [Render Dashboard](https://dashboard.render.com) → Your service → Environment
2. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
3. Must match the secret from Stripe Dashboard

### 3. Check Render Logs

1. Go to Render Dashboard → Your service → Logs
2. Look for webhook events:
   - `[WEBHOOK] Received event: checkout.session.completed`
   - `[WEBHOOK] ✅ License activated for userId: ...`
3. If you see errors, check:
   - Webhook secret mismatch
   - Missing userId in session
   - Server errors

### 4. Test Webhook Manually

In Stripe Dashboard → Webhooks → Your endpoint:
1. Click "Send test webhook"
2. Select event: `checkout.session.completed`
3. Check Render logs to see if it was received

## Common Issues

### Issue 1: Webhook Not Receiving Events

**Symptoms:** No webhook logs in Render

**Solutions:**
- Verify webhook URL in Stripe matches Render URL exactly
- Check webhook secret in Render matches Stripe
- Ensure webhook endpoint is accessible (test with curl)

### Issue 2: Webhook Receives Events But No License Created

**Symptoms:** See `[WEBHOOK] Received event` but no `License activated`

**Solutions:**
- Check logs for `⚠️ Checkout completed but missing userId`
- Verify `client_reference_id` is being set in checkout session
- Check if `session.mode === 'subscription'`

### Issue 3: Server Restarted, Licenses Lost

**Symptoms:** License worked before but stopped after server restart

**Cause:** Backend uses in-memory storage (licenses Map)

**Solution:** 
- Use manual license creation (see above)
- For production, switch to database storage

## Debug Endpoints

### List All Licenses
```
GET https://focus-nudge-extension.onrender.com/api/debug/licenses
```

Returns all licenses currently in memory (for debugging).

### Check License Status
```
GET https://focus-nudge-extension.onrender.com/api/get-license?userId=YOUR_USER_ID
```

Returns license key if active, 404 if not found.

## Next Steps

1. **For Testing:** Use manual license creation (works immediately)
2. **For Production:** 
   - Set up webhook properly
   - Consider adding database storage (licenses lost on server restart)
   - Add monitoring/alerting for webhook failures
