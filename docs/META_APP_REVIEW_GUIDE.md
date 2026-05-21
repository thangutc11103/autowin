# Meta App Review - Submission Preparation Guide

## 📋 Overview

This document prepares everything needed for Meta App Review approval of your social media management application.

---

## 1. 🔗 Public URLs Required by Meta

Make sure these URLs are accessible **without login** and return HTTP 200:

| Page             | URL                                     | Status | Notes                               |
| ---------------- | --------------------------------------- | ------ | ----------------------------------- |
| Login            | https://yourdomain.com/login            | ✅     | Public, shows policy links          |
| Privacy Policy   | https://yourdomain.com/privacy-policy   | ✅     | Comprehensive, Meta-approved format |
| Terms of Service | https://yourdomain.com/terms-of-service | ✅     | Comprehensive, Meta-approved format |
| Data Deletion    | https://yourdomain.com/data-deletion    | ✅     | Public form for deletion requests   |

**Checklist:**

- [ ] All URLs use HTTPS
- [ ] No redirects or 404 errors
- [ ] No login required
- [ ] Privacy Policy link visible on login page
- [ ] Terms of Service link visible on login page

---

## 2. 👤 Test Account for Meta Reviewers

Create and provide this account in your Meta App Review submission:

```
TEST ACCOUNT DETAILS
=====================
Email: reviewer@test.com
Password: Test@123456
Facebook Test Page: [Your Test Page URL]
Instagram Test Account: [Your Test Account Username]

Instructions for Reviewer:
1. Go to https://yourdomain.com/login
2. Enter email: reviewer@test.com
3. Enter password: Test@123456
4. Click "Sign in"
5. Click "Connect Facebook" or the OAuth login button
6. Grant all requested permissions
7. Select a Facebook Page and/or Instagram Business Account
8. Create a test post:
   - Add title: "Test Post - [Current Date]"
   - Add description or caption
   - (Optional) Upload test image
9. Click "Schedule" or "Publish"
10. Verify post appears in the dashboard
11. Check on the connected platform (Facebook/Instagram) to confirm post published
```

**Important:**

- Ensure the test account has access to at least one Facebook Page
- Ensure the test account has access to at least one Instagram Business Account
- The test page/account should be active and not restricted

---

## 3. 📝 Detailed Review Description Template

**For: Meta App Review Submission**

Copy this into the "Description" field when submitting your app:

```
APPLICATION OVERVIEW
====================

Our application is a comprehensive social media management platform designed
to help users and businesses efficiently manage, create, schedule, and publish
content across Facebook and Instagram.

CORE FUNCTIONALITY
==================

1. User Authentication & Account Connection
   - Users log in with their account credentials
   - Users connect their Facebook and Instagram accounts via Meta Login
   - Users grant permissions for the app to manage their social accounts

2. Account Discovery
   - Display list of Facebook Pages managed by the user
   - Display connected Instagram Business Accounts
   - Allow users to select which pages/accounts to manage

3. Content Management
   - Create and edit posts with text, images, and videos
   - Organize content in a queue system
   - Schedule posts for future publishing
   - Publish posts immediately to selected accounts

4. Engagement Tracking
   - Display post engagement metrics (likes, comments, views)
   - Show account statistics and performance data

PERMISSIONS REQUESTED & USAGE
=============================

1. pages_show_list
   PURPOSE: Retrieve the list of Facebook Pages managed by the user
   USAGE: When user logs in, app fetches their Page list and displays it
          in a dropdown so they can select which Page to publish to
   NECESSITY: Required to show which Pages the user can manage

2. pages_read_engagement
   PURPOSE: Access Page engagement metrics (likes, comments, shares, views)
   USAGE: Display post performance data and Page statistics in dashboard
   NECESSITY: Core feature to show content performance

3. pages_manage_posts
   PURPOSE: Create and publish posts to the user's Facebook Pages
   USAGE: When user creates a post and clicks "Publish" or "Schedule",
          app uses this permission to create the post on their Page
   NECESSITY: Core publishing functionality

4. pages_read_user_content
   PURPOSE: Retrieve the user's own posts and content
   USAGE: Display previously published posts and content history
   NECESSITY: For content management and archival features

5. instagram_basic
   PURPOSE: Access basic Instagram Business Account information
   USAGE: Display connected Instagram accounts and basic account info
   NECESSITY: To identify which Instagram accounts user can manage

6. instagram_content_publish
   PURPOSE: Publish photos and videos to Instagram Business Accounts
   USAGE: When user creates a post and selects Instagram as destination,
          app publishes the image/video to their Instagram Business Account
   NECESSITY: Core Instagram publishing functionality

DATA COLLECTION & USAGE
=======================

DATA COLLECTED:
- User account credentials (email, username, password)
- Facebook Page IDs and Instagram Business Account IDs
- Post content (text, images, video references)
- OAuth access tokens from Meta
- Engagement metrics (likes, comments, views, followers)
- User preferences and scheduling settings

SOURCES:
- Direct user input during account creation and content creation
- Meta Graph API after user grants permissions
- User device for content uploads

PURPOSES:
1. Authenticate and authorize user access
2. Display list of manageable social accounts
3. Allow posting of user-created content
4. Track post performance
5. Schedule content publishing
6. Maintain service functionality

DATA RETENTION:
- Stored as long as account is active
- User can request deletion at any time
- Deleted within 30 days of user request
- See https://yourdomain.com/data-deletion

DATA SHARING:
- NEVER sold or shared for marketing purposes
- ONLY shared with Meta (required for API calls)
- ONLY shared with infrastructure providers for service delivery
- Only disclosed if legally required

USER CONTROL & PRIVACY
======================

Users have full control:
- Can disconnect their Facebook/Instagram accounts at any time
- Can delete all their data at any time via https://yourdomain.com/data-deletion
- Can view privacy practices at https://yourdomain.com/privacy-policy
- Can understand terms at https://yourdomain.com/terms-of-service

COMPLIANCE
==========

✓ Follows Meta Platform Policies
✓ Adheres to Facebook Login Terms
✓ Complies with Instagram API Terms
✓ Respects user data privacy
✓ No collection of unnecessary data
✓ Clear data deletion mechanisms
✓ Transparent about data usage
```

---

## 4. 🎬 Screen Recording/Video Demo Requirements

**Meta may request a video demonstration showing:**

### Recommended Video Content (3-5 minutes):

1. **Login Flow (30 seconds)**
   - Show login page with Privacy Policy and Terms links
   - Click "Sign in" with test account
   - Verify login succeeds

2. **Meta OAuth Connection (1 minute)**
   - Click "Connect Facebook" button
   - Complete Meta login
   - Accept/grant permissions
   - Return to app after authorization

3. **Account Discovery (1 minute)**
   - Show list of connected Facebook Pages
   - Show list of connected Instagram Business Accounts
   - Demonstrate selection of a Page and Instagram account

4. **Content Creation (1.5 minutes)**
   - Click "Create Post"
   - Enter post content (title, description)
   - Upload test image (optional but recommended)
   - Show scheduling interface
   - Set publish date/time

5. **Publishing/Scheduling (1 minute)**
   - Click "Schedule" or "Publish"
   - Show confirmation
   - Navigate to Dashboard to verify post in queue
   - (Optional) Navigate to Facebook/Instagram to show published content

6. **Data Deletion (30 seconds)**
   - Navigate to https://yourdomain.com/data-deletion
   - Show deletion form
   - Explain the 30-day processing

### Video Specifications:

- Format: MP4, WebM, or similar
- Resolution: 1080p or higher preferred
- Quality: Clear, audible (can be silent or narrated)
- Duration: 3-5 minutes
- File size: < 100MB preferred
- Include system clock/timestamp

### Narration Suggestions (Optional):

"This is a demonstration of our social media management application.
We'll show how users connect their Facebook and Instagram accounts,
create content, and schedule posts for publishing..."

---

## 5. ✅ Pre-Submission Checklist

### URLs & Accessibility

- [ ] Privacy Policy is accessible at /privacy-policy (no login required)
- [ ] Terms of Service is accessible at /terms-of-service (no login required)
- [ ] Data Deletion form is accessible at /data-deletion (no login required)
- [ ] All URLs return HTTP 200 (no 404s or redirects)
- [ ] All URLs use HTTPS
- [ ] Links are visible and clickable on login page
- [ ] Links use proper anchor tags (href="/privacy-policy")

### Content Quality

- [ ] Privacy Policy includes all 11 required sections
- [ ] Terms of Service includes all 12 required sections
- [ ] Data Deletion page has clear instructions
- [ ] All contact emails are correct (update from "support@yourdomain.com")
- [ ] No spelling or grammar errors
- [ ] Professional formatting and design

### Test Account

- [ ] Test account created and working
- [ ] Test account has access to a Facebook Page
- [ ] Test account has access to an Instagram Business Account
- [ ] Test credentials provided in app review submission
- [ ] Login flow tested and working

### Permissions

- [ ] Only requesting necessary permissions
- [ ] Each permission has clear use case documented
- [ ] No unused permissions requested
- [ ] Permissions match actual app features

### Documentation

- [ ] Detailed description ready
- [ ] Permissions breakdown ready
- [ ] Test account credentials ready
- [ ] Video demo ready (if requested)

---

## 6. 🚀 Meta Developer Dashboard Setup

Before submitting:

1. Go to https://developers.facebook.com/
2. Select your app
3. Go to **Settings** → **Basic**
4. Update these fields:

```
App Name: [Your App Name]
App Domains: yourdomain.com
Privacy Policy URL: https://yourdomain.com/privacy-policy
Terms of Service URL: https://yourdomain.com/terms-of-service
```

5. Go to **Products** → **Facebook Login** → **Settings**
   - Valid OAuth Redirect URIs: Add all your callback URLs
   - Example: https://yourdomain.com/api/auth/facebook/callback

6. Go to **Settings** → **Advanced**
   - Deactivate App: No
   - Keep app active for review

---

## 7. 📧 Submission Example

**Subject:** App Review Submission - Social Media Management Platform

**Body:**

```
Hello Meta Review Team,

We are submitting our application for review to request access to the
following permissions:
- pages_show_list
- pages_read_engagement
- pages_manage_posts
- pages_read_user_content
- instagram_basic
- instagram_content_publish

[INSERT DETAILED DESCRIPTION FROM SECTION 3 ABOVE]

TEST ACCOUNT:
Email: reviewer@test.com
Password: Test@123456

DOCUMENTATION:
Privacy Policy: https://yourdomain.com/privacy-policy
Terms of Service: https://yourdomain.com/terms-of-service
Data Deletion: https://yourdomain.com/data-deletion

Thank you for reviewing our application.
```

---

## 8. 🔄 Common Rejection Reasons & Solutions

| Issue                         | Why Rejected                            | Solution                                       |
| ----------------------------- | --------------------------------------- | ---------------------------------------------- |
| Privacy Policy too vague      | Meta needs specific data practices      | Use Section 3 template - be detailed           |
| Missing data deletion flow    | Users must be able to delete data       | Implement /data-deletion page                  |
| Unclear permission usage      | Each permission needs clear purpose     | Document each permission's exact use           |
| Links not working             | URLs return 404 or require login        | Test all URLs without login                    |
| Requesting unused permissions | App doesn't actually use permission     | Remove unused permissions                      |
| No test account provided      | Reviewer can't test the app             | Create test account with Page/Instagram access |
| Insufficient description      | "Social media tool" isn't enough detail | Follow Section 3 detailed template             |

---

## 9. 📞 Contact & Support

**For Meta App Review Issues:**

- Meta Developer Support: https://developers.facebook.com/support/

**For Your App Issues:**

- Email: support@yourdomain.com

---

## 10. 📅 Timeline & Next Steps

1. **Now:** Complete all checklist items above
2. **Day 1-2:** Set up test account and verify all URLs work
3. **Day 2-3:** Record video demo (if needed)
4. **Day 3-4:** Submit to Meta App Review with complete documentation
5. **Day 4-7:** Monitor Meta review status
6. **Day 7+:** Respond to Meta's questions/clarifications if needed
7. **Day 14-30:** Expect approval or detailed feedback

---

**Last Updated:** {new Date().toLocaleDateString()}
