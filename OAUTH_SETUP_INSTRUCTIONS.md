# OAuth Routes Setup Instructions

This document provides step-by-step instructions to create the 6 OAuth route files needed for your Next.js application.

## Quick Setup (Recommended)

### Option 1: Using npm script
From your project root, run:
```bash
npm run setup:oauth
```

This will automatically:
1. Create all required directories
2. Create all 6 route.ts files with correct code
3. Display success message

### Option 2: Using Batch File (Windows)
Double-click `setup-oauth.bat` in the project root directory. It will:
1. Create all OAuth directories
2. Run the Node.js setup script
3. Display success when complete

### Option 3: Manual Node.js Execution
From your project root, run:
```bash
node create-oauth-routes.js
```

## Files That Will Be Created

The setup script creates these **6 files**:

1. ✅ `app/api/auth/tiktok/route.ts` - TikTok OAuth initiation
2. ✅ `app/api/auth/tiktok/callback/route.ts` - TikTok callback handler
3. ✅ `app/api/auth/meta/route.ts` - Meta (Facebook/Instagram) OAuth initiation
4. ✅ `app/api/auth/meta/callback/route.ts` - Meta callback handler
5. ✅ `app/api/auth/youtube/route.ts` - YouTube/Google OAuth initiation
6. ✅ `app/api/auth/youtube/callback/route.ts` - YouTube callback handler

## Verification

After running the setup, verify the files were created by checking:
```bash
ls app/api/auth/*/route.ts
ls app/api/auth/*/callback/route.ts
```

Or in Windows Explorer, navigate to: `app\api\auth\` and confirm you see the directory structure with all route files.

## What Each File Does

### Initiation Routes (route.ts)
- Generate a random OAuth state
- Store state in secure cookie
- Redirect to platform login

### Callback Routes (callback/route.ts)
- Exchange auth code for token
- Store credentials in oauthStorage
- Handle errors gracefully
- Redirect back to accounts dashboard

## Next Steps

1. Run setup (choose one option above)
2. Restart dev server: `npm run dev`
3. Navigate to: `http://localhost:3000/(dashboard)/accounts`
4. Test OAuth buttons - they should now redirect to proper login pages!

## Troubleshooting

If files aren't created:
1. Ensure Node.js is installed: `node --version`
2. Run from project root directory
3. Check you have write permissions
4. Try Option 3 (manual Node.js execution)

## Files Included in This Setup

- `create-oauth-routes.js` - Main setup script (runs the creation)
- `setup-oauth.bat` - Windows batch helper (runs the Node script)
- `package.json` - Updated with `setup:oauth` npm script

## Support

All files have been pre-generated with:
- Correct imports from `/lib`
- Error handling and logging
- Rate limiting (20 requests per minute)
- CORS and cookie security settings
- Proper TypeScript types

---

**Status**: ✅ Ready to run setup!
