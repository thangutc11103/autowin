# 🔍 OAUTH 404 DEBUG GUIDE - Step by Step

## The Problem (What You See)

```
URL: localhost:3000/api/auth/tiktok
Response: 404 - This page could not be found
```

## The Root Cause

**The route file doesn't exist.**

When you click the TikTok button:
1. Button has `href="/api/auth/tiktok"`
2. Browser navigates to `http://localhost:3000/api/auth/tiktok`
3. Next.js looks for `app/api/auth/tiktok/route.ts`
4. **FILE DOESN'T EXIST** → Returns 404

## The Solution

Create the missing route files.

---

## Debug Step 1: Verify Route Files Don't Exist

Check if these files exist in your project:

```bash
# Windows - Open File Explorer and navigate to:
# find-app\app\api\auth\

# Look for:
✅ tiktok (folder)
   ✅ route.ts (file)
   ✅ callback (folder)
      ✅ route.ts (file)
✅ meta (folder)
   ✅ route.ts (file)
   ✅ callback (folder)
      ✅ route.ts (file)
✅ youtube (folder)
   ✅ route.ts (file)
   ✅ callback (folder)
      ✅ route.ts (file)
```

**Current Status:** ❌ These don't exist yet

---

## Debug Step 2: Verify OAuth Utils Exist

These files SHOULD exist and be working:

```bash
# These SHOULD exist ✅
lib/oauth-utils.ts     # Has: getTikTokAuthUrl(), exchangeTikTokCode(), etc.
lib/oauth-storage.ts   # Has: oauthStorage with addAccount()
lib/rate-limit.ts      # Has: createRateLimiter()
types/oauth.ts         # Has: OAuthAccount interface
```

**Check this with:**
```bash
# If these imports fail in your route, oauth-utils have problems
import { getTikTokAuthUrl } from "@/lib/oauth-utils";
import { oauthStorage } from "@/lib/oauth-storage";
import { createRateLimiter } from "@/lib/rate-limit";
```

---

## Debug Step 3: Verify Button Links Are Correct

In `app/(dashboard)/accounts/page.tsx`:

```tsx
// Should have these buttons:
<a href="/api/auth/tiktok">TikTok</a>
<a href="/api/auth/meta">Meta</a>
<a href="/api/auth/youtube">YouTube</a>
```

**Status:** ✅ These are correct

---

## Debug Step 4: Environment Variables

Check `.env.local` has all OAuth credentials:

```env
✅ TIKTOK_CLIENT_KEY=xxx
✅ TIKTOK_CLIENT_SECRET=xxx
✅ META_APP_ID=xxx
✅ META_APP_SECRET=xxx
✅ GOOGLE_CLIENT_ID=xxx
✅ GOOGLE_CLIENT_SECRET=xxx
✅ NEXT_PUBLIC_APP_URL=https://dribble-bucked-ninetieth.ngrok-free.dev
```

**Status:** ✅ Should already be set

---

## Debug Step 5: Create the Route Files

This is the fix!

**Option A: Run the Node script**
```bash
node create-oauth-routes.js
```

**Option B: Run the batch file (Windows)**
```bash
setup-oauth.bat
```

**Option C: Manual (copy from CREATE_OAUTH_ROUTES.md)**

---

## Debug Step 6: Verify Files Were Created

After running the script, check:

```bash
# These should now exist ✅
app/api/auth/tiktok/route.ts
app/api/auth/tiktok/callback/route.ts
app/api/auth/meta/route.ts
app/api/auth/meta/callback/route.ts
app/api/auth/youtube/route.ts
app/api/auth/youtube/callback/route.ts
```

**View file contents to confirm:**
- Each file should import `getTikTokAuthUrl` or similar
- Each file should have a GET handler
- Files should have proper error handling

---

## Debug Step 7: Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

**Wait for: "Ready in Xs" message**

---

## Debug Step 8: Test the Fix

1. Open: http://localhost:3000/(dashboard)/accounts
2. Click: **TikTok** button
3. Expected: Redirect to TikTok authorization page
4. NOT expected: 404 error

---

## What Each Route Should Do

### `GET /api/auth/tiktok`
1. Generate random state (CSRF protection)
2. Set HttpOnly cookie with state
3. Redirect to: `https://www.tiktok.com/v1/oauth/authorize?...`
4. TikTok shows login page

### `GET /api/auth/tiktok/callback`
1. Receive: `?code=xxx&state=yyy`
2. Verify state matches cookie
3. Exchange code for token via `exchangeTikTokCode()`
4. Store token via `oauthStorage.addAccount()`
5. Redirect back to: `/accounts?oauth=tiktok&success=true`

### Same pattern for Meta and YouTube

---

## Full Debug Checklist

- [ ] Route files don't exist (app/api/auth/ directory)
- [ ] OAuth utils exist and export correct functions
- [ ] Button links are `/api/auth/tiktok` etc.
- [ ] .env.local has all OAuth credentials
- [ ] Ran: `node create-oauth-routes.js`
- [ ] All 6 route files created
- [ ] Dev server restarted
- [ ] Click TikTok button → redirects to TikTok login (not 404)
- [ ] ✅ Done!

---

## Expected Network Flow

```
Step 1: Click TikTok Button
  GET /api/auth/tiktok
  ↓
Step 2: OAuth Init Route
  Generates state
  Sets cookie
  Returns 302 redirect to TikTok
  ↓
Step 3: User Sees TikTok Login
  User logs in at: https://www.tiktok.com/v1/oauth/authorize?...
  ↓
Step 4: TikTok Redirects Back
  POST to: /api/auth/tiktok/callback?code=xxx&state=yyy
  ↓
Step 5: OAuth Callback Route
  Validates state
  Exchanges code for token
  Stores token in oauthStorage
  Returns 302 redirect to /accounts?success=true
  ↓
Step 6: Success!
  Page shows: "Account connected!"
  Account appears in list
```

---

## If It Still Shows 404

1. **Did you restart the dev server?**
   - Must restart after creating files

2. **Did the script fail?**
   - Run: `node create-oauth-routes.js` again
   - Check terminal for errors

3. **Files not created?**
   - Check file permissions
   - Try manual creation from CREATE_OAUTH_ROUTES.md

4. **Still 404?**
   - Clear `.next` folder: `rm -r .next`
   - Restart server: `npm run dev`

---

## Next: Test Each Platform

Once TikTok works, test the others:

- [ ] TikTok OAuth works
- [ ] Meta OAuth works  
- [ ] YouTube OAuth works

All use the same pattern, so if TikTok works, the others should too!

---

## Success!

Once you see TikTok authorization page (not 404), OAuth is working! 🎉

All the hard infrastructure is built. You just needed the route files!
