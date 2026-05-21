# 🎯 Meta App Review - Action Checklist

## ✅ Completed: Pages Created

- [x] **Privacy Policy** → `/privacy-policy` - Comprehensive 11-section policy
- [x] **Terms of Service** → `/terms-of-service` - Comprehensive 12-section policy
- [x] **Data Deletion Form** → `/data-deletion` - Public form for deletion requests
- [x] **Login Footer** - Added links to Privacy Policy and Terms of Service
- [x] **Documentation** → `docs/META_APP_REVIEW_GUIDE.md` - Complete submission guide

---

## 📋 YOUR IMMEDIATE ACTION ITEMS

### Step 1: Update Email Addresses

**Time: 5 minutes**

Find and replace all instances of `support@yourdomain.com` with your actual email:

Files to update:

- [ ] `/app/privacy-policy/page.tsx` - Lines 77, 158
- [ ] `/app/terms-of-service/page.tsx` - Lines 117, 189
- [ ] `/app/data-deletion/page.tsx` - Lines 102
- [ ] `/docs/META_APP_REVIEW_GUIDE.md` - Multiple locations

**Search & Replace in VS Code:**

```
Find: support@yourdomain.com
Replace: your.email@yourcompany.com
```

---

### Step 2: Create Test Account

**Time: 15 minutes**

1. [ ] Create new test account with email: `reviewer@test.com`
2. [ ] Verify test account can log in
3. [ ] Create a Facebook Test Page (or use existing one)
4. [ ] Grant reviewer@test.com admin access to that Page
5. [ ] Create a Facebook Test App
6. [ ] Convert Instagram Personal Account to Business Account
7. [ ] Link Instagram Business Account to the Facebook Page
8. [ ] Record test account credentials securely

**Credentials to save:**

```
Test Email: reviewer@test.com
Test Password: [Your chosen password - update in META_APP_REVIEW_GUIDE.md]
Test Facebook Page: [URL and ID]
Test Instagram Account: [Username]
Test Instagram Business ID: [ID number]
```

---

### Step 3: Test All Public URLs

**Time: 10 minutes**

1. [ ] Go to https://yourdomain.com/login (no login required)
2. [ ] Click "Privacy Policy" link - should work without login ✅
3. [ ] Click "Terms of Service" link - should work without login ✅
4. [ ] Navigate to https://yourdomain.com/privacy-policy directly ✅
5. [ ] Navigate to https://yourdomain.com/terms-of-service directly ✅
6. [ ] Navigate to https://yourdomain.com/data-deletion directly ✅
7. [ ] Test data deletion form with test account ✅
8. [ ] Verify all links work without HTTPS errors
9. [ ] Check mobile responsiveness (optional but recommended)

---

### Step 4: Update Meta Developer Dashboard

**Time: 10 minutes**

Go to https://developers.facebook.com/

For your app:

1. [ ] **Settings** → **Basic**
   - [ ] Set Privacy Policy URL: https://yourdomain.com/privacy-policy
   - [ ] Set Terms of Service URL: https://yourdomain.com/terms-of-service
2. [ ] **Products** → **Facebook Login** → **Settings**
   - [ ] Add Valid OAuth Redirect URI: https://yourdomain.com/api/auth/facebook/callback
   - [ ] Add any other callback URLs your app uses

3. [ ] **Settings** → **Roles**
   - [ ] Make test account a Tester role (for testing)

---

### Step 5: Review Your Permissions

**Time: 10 minutes**

Check which permissions your app actually requests:

1. [ ] Go to `app/api/auth/[provider]/route.ts` or your OAuth setup
2. [ ] List all permissions currently requested
3. [ ] Verify each permission has a use case (don't request unused permissions)
4. [ ] Update `docs/META_APP_REVIEW_GUIDE.md` Section 3 with your exact permissions

**Example - If you only request these 3 permissions:**

```javascript
const scope = [
  "pages_show_list",
  "pages_manage_posts",
  "instagram_content_publish",
];
```

Then only include those 3 in your submission (remove unused ones from guide).

---

### Step 6: Create Video Demo (Optional but Recommended)

**Time: 30-60 minutes**

Meta may request this. Create a 3-5 minute video showing:

1. [ ] **Login Page** - Show Privacy/Terms links are visible
2. [ ] **Meta OAuth Flow** - Connect Facebook account
3. [ ] **Grant Permissions** - Accept requested permissions
4. [ ] **Select Page** - Choose Facebook Page to manage
5. [ ] **Create Post** - Write content and upload image
6. [ ] **Schedule Post** - Set publish date/time
7. [ ] **Confirm** - Show post added to queue
8. [ ] **Result** - Show post published on Facebook/Instagram

**Tools for recording:**

- Windows: Win + G (Xbox Game Bar)
- Mac: Command + Shift + 5
- Online: Loom.com, Screencastify, OBS Studio

---

### Step 7: Prepare Submission Document

**Time: 20 minutes**

1. [ ] Read through `docs/META_APP_REVIEW_GUIDE.md` completely
2. [ ] Update all email addresses
3. [ ] Update all URLs if needed
4. [ ] Update permissions list to match your app
5. [ ] Update description to match your features
6. [ ] Save a copy as `META_SUBMISSION_FINAL.txt`
7. [ ] Use this document when submitting to Meta

---

### Step 8: Submit to Meta App Review

**Time: 15 minutes**

1. [ ] Go to https://developers.facebook.com/apps/[your-app-id]/app-review
2. [ ] Click "Submit for App Review" or "Request Advanced Access"
3. [ ] Select permissions you want to request:
   - [ ] pages_show_list
   - [ ] pages_manage_posts
   - [ ] instagram_content_publish
   - [ ] (others as applicable)

4. [ ] Fill in submission form with:
   - [ ] App Purpose: "Social media management platform for scheduling and publishing posts"
   - [ ] Detailed Description: Copy from Section 3 of META_APP_REVIEW_GUIDE.md
   - [ ] Permission Usage: Detailed explanation for each permission
   - [ ] Test Account: reviewer@test.com / [password]
   - [ ] Video Demo: If available, upload here

5. [ ] Include links:
   - [ ] Privacy Policy: https://yourdomain.com/privacy-policy
   - [ ] Terms of Service: https://yourdomain.com/terms-of-service
   - [ ] Data Deletion: https://yourdomain.com/data-deletion

6. [ ] Submit!

---

## 🔍 Quick Verification Checklist

Before submitting, verify:

```
URLs & Accessibility:
[ ] https://yourdomain.com/login (public, no login required)
[ ] https://yourdomain.com/privacy-policy (public, no login required)
[ ] https://yourdomain.com/terms-of-service (public, no login required)
[ ] https://yourdomain.com/data-deletion (public, no login required)
[ ] All use HTTPS (not HTTP)
[ ] No 404 errors
[ ] No redirects to login

Content Quality:
[ ] Privacy Policy addresses:
    [ ] What data we collect
    [ ] Where we get it
    [ ] What we use it for
    [ ] Who we share it with
    [ ] How long we keep it
    [ ] How to delete it
    [ ] Contact info

[ ] Terms of Service addresses:
    [ ] What the service does
    [ ] User responsibilities
    [ ] Prohibited uses
    [ ] Our rights
    [ ] Liability limits
    [ ] Contact info

Test Account:
[ ] Test account created
[ ] Test account can login
[ ] Test account has Facebook Page access
[ ] Test account has Instagram access
[ ] Credentials documented

Permissions:
[ ] Listed all permissions requested
[ ] Each permission has clear use case
[ ] No unused permissions requested

Documentation:
[ ] Detailed app description ready
[ ] Permission explanations complete
[ ] Test account provided
[ ] Video demo ready (if applicable)
```

---

## ⏱️ Estimated Timeline

| Step                  | Time      | Total       |
| --------------------- | --------- | ----------- |
| Update emails         | 5 min     | 5 min       |
| Create test account   | 15 min    | 20 min      |
| Test URLs             | 10 min    | 30 min      |
| Update Meta dashboard | 10 min    | 40 min      |
| Review permissions    | 10 min    | 50 min      |
| Create video          | 30-60 min | 80-110 min  |
| Prepare submission    | 20 min    | 100-130 min |
| Submit                | 15 min    | 115-145 min |

**Total Time: ~2-2.5 hours to complete everything**

---

## 📞 If You Get Rejected

**Common reasons & fixes:**

1. **"Privacy Policy not detailed enough"**
   - Use exact text from `/app/privacy-policy/page.tsx`
   - Make sure it covers all 11 sections

2. **"Not clear what permissions are used for"**
   - Add to META_SUBMISSION_FINAL.txt: Exact code that uses each permission
   - Example: "When user creates post, we call [specific API] using pages_manage_posts"

3. **"Test account doesn't work"**
   - Make sure test account can actually login
   - Make sure it has access to Facebook Page/Instagram
   - Test the flow yourself first

4. **"Can't access privacy policy"**
   - Check URL is correct in Meta dashboard
   - Check link works from login page
   - Clear browser cache and test again

5. **"Requesting too many permissions"**
   - Remove any permissions you don't actually use
   - Submit with only necessary permissions

---

## 📚 Reference Documents

- [x] Created: `/app/privacy-policy/page.tsx` - Comprehensive Privacy Policy
- [x] Created: `/app/terms-of-service/page.tsx` - Comprehensive Terms of Service
- [x] Created: `/app/data-deletion/page.tsx` - Data Deletion Request Form
- [x] Created: `/docs/META_APP_REVIEW_GUIDE.md` - Full submission guide
- [x] Updated: `/app/login/page.tsx` - Added policy links

---

## ✨ Next Steps

1. **Start with Step 1** - Update email addresses (takes 5 min)
2. **Then Step 2** - Create test account (takes 15 min)
3. **Then Step 3** - Test all URLs (takes 10 min)
4. **Continue through Step 8** - Submit to Meta

**Estimated total time: 2-2.5 hours**

Good luck with your Meta App Review! 🚀
