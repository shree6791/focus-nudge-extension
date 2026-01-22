# Next Steps - Almost Done! 🚀

## ✅ What's Working

- [x] Backend deployed to Render
- [x] `/api/config` endpoint returning correct publishable key
- [x] Extension automatically fetches Stripe key from backend
- [x] All environment variables configured (except webhook secret)

## 🔲 Final Step: Set Up Stripe Webhook

The webhook is **critical** - it activates Pro licenses after payment.

### Step 1: Create Webhook in Stripe

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://focus-nudge-extension.onrender.com/api/webhook`
4. **Select Events** (click "Select events"):
   - ✅ `checkout.session.completed` (activates license after payment)
   - ✅ `customer.subscription.updated` (handles subscription changes)
   - ✅ `customer.subscription.deleted` (handles cancellations)
5. Click **"Add endpoint"**

### Step 2: Get Webhook Secret

After creating the endpoint:
1. Click on the endpoint you just created
2. Find **"Signing secret"** (starts with `whsec_`)
3. Click **"Reveal"** and copy it

### Step 3: Add to Render

1. Go to [Render Dashboard](https://dashboard.render.com) → Your service
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. **Key**: `STRIPE_WEBHOOK_SECRET`
5. **Value**: `whsec_...` (paste the secret you copied)
6. Click **"Save Changes"**
7. Render will automatically redeploy

## 🧪 Test the Complete Flow

### 1. Reload Extension

1. Go to `chrome://extensions`
2. Find "Focus Nudge"
3. Click the reload icon 🔄

### 2. Test Payment Flow

1. **Open Options**: Right-click extension icon → Options
2. **Check Status**: Should show "Basic" plan
3. **Click "Upgrade to Pro"**: Should redirect to Stripe Checkout
4. **Use Test Card**:
   - Card Number: `4242 4242 4242 4242`
   - Expiry: `12/34` (any future date)
   - CVC: `123` (any 3 digits)
   - ZIP: `12345` (any 5 digits)
5. **Complete Payment**: Click "Subscribe"
6. **Wait 5-10 seconds**: Webhook processes the payment
7. **Refresh Options Page**: Should now show "Pro" status! 🎉

### 3. Verify in Stripe Dashboard

1. Go to [Stripe Dashboard → Payments](https://dashboard.stripe.com/payments)
2. You should see the test payment
3. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
4. Click your webhook endpoint
5. Check "Events" tab - should show `checkout.session.completed`

### 4. Test Pro Features

1. In Options page, you should now see:
   - ✅ "Pro" plan status
   - ✅ Customizable tone settings
   - ✅ Adjustable drift threshold
   - ✅ Adjustable cooldown
   - ✅ "Manage Subscription" button

2. Test a nudge:
   - Go to LinkedIn feed
   - Scroll passively for 15+ minutes (or adjust threshold lower for testing)
   - Should see a nudge with your custom settings

## 🐛 Troubleshooting

### Webhook Not Working?

1. **Check Render Logs**: Render Dashboard → Your service → Logs
   - Look for webhook events
   - Check for errors

2. **Verify Webhook Secret**: 
   - Make sure `STRIPE_WEBHOOK_SECRET` in Render matches Stripe Dashboard
   - Secret should start with `whsec_`

3. **Test Webhook Manually**:
   ```bash
   # In Stripe Dashboard → Webhooks → Your endpoint → "Send test webhook"
   # Select event: checkout.session.completed
   # Check Render logs to see if it was received
   ```

### Payment Not Activating License?

1. **Check Browser Console**: 
   - Open Options page
   - Press F12 → Console tab
   - Look for errors

2. **Check License Verification**:
   - After payment, wait 10 seconds
   - Options page should auto-refresh
   - If not, manually refresh the page

3. **Verify User ID**:
   - Options page should show your user ID
   - This is used to link payment to license

### Extension Can't Connect to Backend?

1. **Check Network Tab**: 
   - F12 → Network tab
   - Look for requests to `focus-nudge-extension.onrender.com`
   - Check if they're failing

2. **Verify Manifest Permissions**:
   - `manifest.json` should include Render URL in `host_permissions`

## ✅ Success Checklist

- [ ] Webhook created in Stripe
- [ ] Webhook secret added to Render
- [ ] Extension reloaded
- [ ] Test payment completed
- [ ] License activated (Pro status shown)
- [ ] Pro features working

## 🎉 You're Done!

Once the webhook is set up and tested, your payment flow is complete! Users can now:
- Upgrade to Pro via Stripe Checkout
- Manage their subscription
- Enjoy Pro features

For production:
- Switch to Stripe Live keys
- Update pricing if needed
- Consider adding a database (currently using in-memory storage)
