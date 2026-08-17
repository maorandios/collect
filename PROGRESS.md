# יומן עבודה — קולקט

קובץ זה מתעד מה בוצע בכל שלב שהושלם. מעודכן בסוף כל Phase.

---

## Phase 1 — Foundation

**תאריך:** 17 באוגוסט 2026  
**סטטוס:** הושלם  
**השלב הבא:** ממתין לאישור לפני Phase 2 (Runtime ידני בלי AI)

### מטרת השלב

לבנות שלד אפליקציה עובד: Next.js, RTL עברית, עיצוב, אימות OTP, Proxy, App shell, ו־migrations מלאות. בלי Runtime, בלי Gmail חי, בלי AI.

### החלטות מחייבות שיושמו (מחליפות את הטיוטה המקורית)

1. **אימות:** Supabase Email OTP עם קוד 6 ספרות. מסך `/login` דו־שלבי. אין `/signup`. אין `/auth/callback`.
2. **Next.js:** `src/proxy.ts` במקום `middleware.ts`. רענון סשן + הגנת עמודים. `getUser()` גם ב־Server Components / Route Handlers.
3. **Cron:** רק `pg_cron` + `pg_net`. אין `vercel.json`. `POST /api/cron/tick` עם `CRON_SECRET`. סודות ב־Vault בשמות `app_url` ו־`cron_secret`.
4. **Magic Link:** סכמת DB עם `token_version` + `token_expires_at` (HMAC ימומש ב־Phase 2). אין `token_hash`.
5. **קבצים:** bucket פרטי `request-files` בלי מדיניות לקוח. Signed Upload ימומש ב־Phase 2.
6. **Nylas:** טבלת `nylas_oauth_states` ל־state חד־פעמי בשרת. אין routes של Nylas בשלב זה.
7. **Jobs:** `claim_due_workflows()`, `claim_due_jobs()`, `processing_started_at`, reclaim אחרי timeout של 5 דקות, `idempotency_key` unique.
8. **מייל בדיקה:** עמודה `requests.is_test`. בקשות בדיקה מוסתרות מהאינדקס של הדאשבורד.
9. **OpenAI:** `OPENAI_MODEL` ב־env, ברירת מחדל `gpt-5.6`. לא חובר למודל בשלב זה.
10. **כתובת אפליקציה:** `APP_URL` ו־`MAGIC_LINK_SECRET` ב־`.env.example`. אין `NEXT_PUBLIC_APP_URL`.

### מה נבנה בפועל

- פרויקט Next.js 16.3.1 + React 19 + TypeScript strict + Tailwind 4 + shadcn/ui (RTL)
- `lang="he"` ו־`dir="rtl"` ברמת האפליקציה
- פונט Heebo (עברית + לטינית)
- טוקני צבע לפי הפלטה שאושרה
- מילון מחרוזות מרכזי ב־`src/lib/i18n/he.ts` — אין טקסט UI קשיח באנגלית בקומפוננטות
- כניסה: `signInWithOtp({ email })` ואז `verifyOtp({ email, token, type: "email" })`
- Proxy מרענן סשן, מגן על `/requests`, `/workflows`, `/settings`, ומפנה משתמש מחובר מ־`/login` ל־`/requests`
- App shell במסך מלא: Sidebar ימני, wordmark **קולקט**, ניווט בקשות / וורקפלואוס / הגדרות
- דאשבורד בקשות עם טבלה ריקה בעברית וכפתור «יצירת וורקפלואו»
- הגדרות: שם תצוגה + שם עסק (נשמר ל־`profiles`). Gmail מוצג כמנותק וממתין לשלב הבא
- `POST /api/cron/tick` מאמת `CRON_SECRET` ומחזיר `{ ok: true }` בלי לוגיקת תזמון
- Migration מלאה כולל RLS, Storage bucket, claim functions, ו־cron כל דקה ל־`invoke_cron_tick()`

### קבצים שנוצרו או עודכנו

#### תשתית

- `.env.example`
- `.gitignore` — מאפשר commit של `.env.example`
- `package.json` — נוסף סקריפט `typecheck`
- `components.json` — shadcn עם `rtl: true`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/proxy.ts`

#### אימות ו־Supabase

- `src/lib/env.ts`
- `src/lib/i18n/he.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `src/lib/supabase/proxy.ts`
- `src/lib/auth/require-user.ts`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/login/login-form.tsx`

#### ממשק

- `src/components/providers.tsx`
- `src/components/shell/app-sidebar.tsx`
- `src/app/page.tsx` — הפניה ל־`/requests` או `/login`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/loading.tsx`
- `src/app/(app)/actions.ts` — התנתקות ועדכון פרופיל
- `src/app/(app)/requests/page.tsx`
- `src/app/(app)/workflows/page.tsx`
- `src/app/(app)/workflows/new/page.tsx` — placeholder לשלב הבא
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/settings/settings-form.tsx`
- `src/components/ui/*` — button, input, label, card, table, badge, sonner, separator, skeleton, dropdown-menu, tooltip

#### API ו־DB

- `src/app/api/cron/tick/route.ts`
- `supabase/migrations/0001_init.sql`

### סכמת מסד שנוצרה ב־migration

`profiles`, `mailboxes`, `nylas_oauth_states`, `workflows`, `requests`, `submissions`, `files`, `jobs`, `request_events`

עמודות חשובות:

- `workflows.definition` jsonb, `run_claimed_at`
- `requests.definition_snapshot` jsonb, `token_version`, `token_expires_at`, `is_test`
- `jobs.processing_started_at`, `idempotency_key` unique
- unique על `(workflow_id, recipient_email, scheduled_for)`

פונקציות:

- `claim_due_workflows(p_limit)`
- `claim_due_jobs(p_limit)` — מחזיר job תקוע מ־`processing` ל־`pending` אחרי 5 דקות
- `invoke_cron_tick()` — קורא ל־`APP_URL/api/cron/tick` עם הסוד מ־Vault
- cron job בשם `collect-cron-tick` כל דקה

RLS: משתמש רואה רק את שלו. אין מדיניות לקוח ל־`jobs` ול־`nylas_oauth_states`. Service Role לא נחשף ללקוח.

### בדיקות שורצו

| פקודה | תוצאה |
|---|---|
| `npm run lint` | עבר, ללא אזהרות |
| `npm run typecheck` | עבר |

### מה לא נכלל במכוון (Phase 2+)

- Form Renderer וטופס נמען
- HMAC Magic Link
- Signed Upload URLs
- שליחת מייל / Nylas OAuth
- מנוע התזמון (רק stub + SQL)
- צ׳אט AI Compiler
- Playwright / unit tests

### מה חסום עד שתספקו סביבה

הממשק רץ כשלד, אבל הזרימה החיה דורשת:

1. מילוי `.env.local` לפי `.env.example`
2. פרויקט Supabase עם Email OTP ותבנית מייל `{{ .Token }}`
3. הרצת `supabase/migrations/0001_init.sql`
4. יצירת סודות Vault: `app_url`, `cron_secret`

בלי אלה: OTP לא יישלח, שמירת פרופיל תיכשל, ו־pg_cron לא יפעיל את ה־tick.

### הערות תפעול ל־Supabase

- תבנית מייל Auth: `{{ .Token }}`, לא קישור Magic Link.
- בפיתוח מקומי: להפעיל `POST /api/cron/tick` ידנית עם `Authorization: Bearer $CRON_SECRET`. לא לשמור `http://localhost:3000` ב־Vault של פרויקט hosted — pg_cron רץ בצד Supabase ולא מגיע ללפטופ.
- בפריסה: לשמור ב־Vault את כתובת ה־Vercel האמיתית כ־`app_url`, ואת אותו ערך של `CRON_SECRET` כ־`cron_secret`.
- Tunnel ציבורי רק אם באמת צריך ש־cron hosted יפגע בשרת מקומי.

### בדיקות סגירה (17 באוגוסט 2026)

- `npm run lint` — עבר
- `npm run typecheck` — עבר
- `npm run build` — נכשל תחילה בפרי־רנדור של `/requests` בלי Supabase. תוקן: `force-dynamic` לעמודים מאומתים, ו־`requireUser` מפנה ל־`/login` אם אין קונפיגורציה. אחרי התיקון ה־build עבר.
- `/login` — עולה בעברית, `lang=he` `dir=rtl`, כרטיס ממורכז, אין מחרוזות Error/Success/Loading/Submit. צילום ב־Edge headless.
- `/requests` `/workflows` `/workflows/new` `/settings` `/` — בלי סשן מחזירים 307 אל `/login`. לא ניתן לבדוק Sidebar ויזואלית בלי Supabase מחובר.
- Sidebar ימני בקוד: `flex` עם `dir=rtl` וה־sidebar כילד ראשון; `overflow-hidden` על ה־shell.
- הרשאות SQL: `REVOKE EXECUTE` מפורש מ־`public`/`anon`/`authenticated` ל־`claim_due_workflows`, `claim_due_jobs`, `invoke_cron_tick`. `invoke_cron_tick` גם מ־`service_role`. `GRANT EXECUTE` לפונקציות ה־claim רק ל־`service_role`. `SECURITY DEFINER` עם `search_path = public, pg_temp`.
- Vault: אין לשמור localhost ב־`app_url` בפרויקט hosted. בפיתוח tick ידני; בפריסה URL של Vercel.
