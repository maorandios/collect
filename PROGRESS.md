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
3. הדבקה ידנית של `supabase/migrations/0001_init.sql` ב־SQL Editor (לא דרך הסוכן)
4. יצירת סודות Vault: `app_url`, `cron_secret`

בלי אלה: OTP לא יישלח, שמירת פרופיל תיכשל, ו־pg_cron לא יפעיל את ה־tick.

### הערות תפעול ל־Supabase

- תבנית מייל Auth: `{{ .Token }}` בלבד, בלי `{{ .ConfirmationURL }}`. להדביק `supabase/auth/otp-email.html` גם ב־Confirm sign up וגם ב־Magic link. לכבות Confirm email כדי שבפעם הראשונה יישלח OTP ולא קישור אישור.
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
- Git: אותחל. קומיט ראשון `4a2ee6e` — Phase 1 בלבד. אין `.env.local` ואין סודות בקומיט.

---

## Phase 2 — Runtime ידני (ללא AI וללא Gmail)

**תאריך:** 18 באוגוסט 2026  
**סטטוס:** הושלם מול Supabase חי  
**השלב הבא:** Phase 3 אושר והושלם.

### מה נבנה

- Zod schema ל־Workflow Definition + דוגמת רוני (`send_now` כדי לבדוק בלי להמתין לחודש)
- עורך JSON במסך מפוצל + Preview חי בעברית. העורך עצמו LTR/monospace; שאר הממשק RTL
- שמירת טיוטה מפנה ל־`/workflows/[id]` כדי שרענון יטען את הטיוטה
- הפעלה שיוצרת Request לכל נמען עם `definition_snapshot`. ב־`send_now` הפעלה כפולה לא יוצרת Request נוסף
- HMAC Magic Link: `request_id` + `token_version` + `expires_at`, חתום ב־`MAGIC_LINK_SECRET`
- `GET /r/[token]` מאמת, שם Cookie HttpOnly על תשובת ה־redirect, ומפנה ל־`/r` בלי הטוקן ב־URL
- GET לא מסמן נפתח; `POST /api/public/touch` אחרי אינטראקציה ראשונה מעדכן `opened_at` ו־`in_progress`
- טופס דינמי, שמירת טיוטה, שליחה; רענון טוען תשובות וקבצים שנשמרו
- העלאה ישירה ל־Storage עם Signed Upload URL + finalize. נתיב: `{requestId}/{fieldId}/{uuid}-{filename}`
- דאשבורד מסתיר `is_test=true` כברירת מחדל
- פרטי בקשה, העתקת קישור, הורדת קבצים ב־Signed URL
- בקשה שהושלמה נעולה: טופס, draft, upload ו־submit מחזירים 409 / מסך «הבקשה כבר הוגשה»

### תקלות שתוקנו בסגירה

- עורך JSON ירש RTL והמבנה נראה הפוך — `dir="ltr"`, `text-align: left`, `font-family: monospace`, `wrap="off"`, scrollbar פנימי
- אחרי שמירת טיוטה ב־`/workflows/new` רענון איבד את הטיוטה — `router.replace(/workflows/[id])`
- רענון טופס נמען לא הציג טיוטה/קבצים — טעינה מ־`submissions` ו־`files`
- הפעלה כפולה של `send_now` יצרה Request נוסף כי `scheduled_for` השתנה — דילוג על נמענים שכבר יש להם בקשה
- טוקן שפג תוקפו הופנה ל־`/r/invalid` במקום `/r/expired` — בדיקת תפוגה אחרי אימות חתימה
- `upload-finalize` לא חסם בקשה שהושלמה

### בדיקות שורצו מול Supabase חי

Happy Path:

| בדיקה | תוצאה |
|---|---|
| יצירת Workflow מדוגמת רוני עם `send_now` | עבר |
| שמירת טיוטה וטעינה מחדש | עבר |
| הפעלת Workflow | עבר |
| Request אחד עם `definition_snapshot` | עבר |
| Magic Link תקין | עבר |
| פתיחה בלי סשן בעלים, redirect מ־`/r/[token]` ל־`/r` + Cookie | עבר |
| GET לא משנה סטטוס | עבר |
| אינטראקציה ראשונה → `in_progress` | עבר |
| העלאת PDF ותמונות ל־Storage | עבר |
| שמירת טיוטה, רענון, מידע נשמר | עבר |
| שליחת טופס → `completed` | עבר |
| תשובות וקבצים אצל בעל החשבון | עבר |
| הורדה ב־Signed URL | עבר |
| בקשה שהושלמה נעולה | עבר |

שליליות:

| בדיקה | תוצאה |
|---|---|
| טוקן ששונה בתו אחד → `/r/invalid` | עבר |
| טוקן שפג תוקפו → `/r/expired` | עבר |
| `/r` בלי Cookie | עבר |
| קובץ מסוג אסור | עבר |
| קובץ גדול מדי | עבר |
| Submit בלי שדות חובה | עבר |
| הפעלה כפולה בלי Request נוסף | עבר |
| משתמש אחר: RLS ריק, בלי תשובות/קבצים, הורדה 404 | עבר |

מסד ו־Storage: `workflows`, `requests`, `submissions`, `files`, `request_events`, bucket `request-files`. נתיבים בצורה `{requestId}/{fieldId}/{uuid}-{filename}`.

| פקודה | תוצאה |
|---|---|
| `npm run lint` | עבר |
| `npm run typecheck` | עבר |
| `npm run build` | עבר |

**כלל:** לא `supabase db push`, לא `psql`, לא חיבור Postgres, לא הרצת SQL מול הפרויקט. הקובץ נשאר בריפו; ההחלה ידנית.

---

## Phase 3 — Nylas Gmail

**תאריך:** 18 באוגוסט 2026  
**סטטוס:** הושלם מול Gmail חי. תיבת הבדיקה נותקה בסוף הבדיקות — יש לחבר מחדש מההגדרות לפני שימוש.  
**השלב הבא:** Phase 4 התחיל.

### מה נבנה

- OAuth Hosted של Nylas ל־Gmail בלבד (`provider=google`, scope מינימלי ל־`gmail.send` + כתובת התיבה)
- `POST /api/nylas/connect` ו־`POST /api/nylas/disconnect` דורשים משתמש מחובר
- `GET /api/nylas/callback` ציבורי: מאמת hash של state, צריכה אטומית, מחליף code ב־grant
- נשמרים רק `grant_id`, אימייל, provider וסטטוס `connected`. אין Google tokens במסד
- מסך הגדרות: חיבור / ניתוק / חיבור מחדש, כתובת התיבה, סטטוס
- תיבה אחת למשתמש. בכשל OAuth אין mailbox חלקי
- הפעלת Workflow יוצרת Request במצב `scheduled` ו־job מסוג `send_email`
- `send_now` ושליחת בדיקה מפעילים את ה־worker מיד. Cron לא חובר
- `Idempotency-Key` = `jobs.idempotency_key` קבוע לכל job, גם ב־retry
- 401/403 → `needs_reauth` בלי retries עד חיבור מחדש. 429/5xx → pending + backoff. payload קבוע → job failed
- מייל RTL בעברית עם escaping, כפתור «פתיחת הבקשה», Magic Link מ־Phase 2, fallback לקישור
- שליחת בדיקה לתיבה המחוברת, `is_test=true`, נושא `[בדיקה]`, מוסתרת מהדאשבורד
- אין הפעלה בלי mailbox מחובר. השליחה תמיד לפי mailbox של המשתמש המחובר

### קבצים שנוצרו או עודכנו

נוצרו: `src/lib/nylas/*`, `src/lib/mailbox.ts`, `src/lib/email/*`, `src/lib/jobs/*`, `src/app/api/nylas/{connect,callback,disconnect}/route.ts`, `src/components/settings/gmail-card.tsx`

עודכנו: `src/app/(app)/settings/page.tsx`, `src/app/(app)/workflows/actions.ts`, `src/app/(app)/workflows/new/*`, `src/app/(app)/workflows/[id]/page.tsx`, `src/lib/requests/create.ts`, `src/lib/i18n/he.ts`, `src/components/workflows/preview-panel.tsx`, `.env.example`

### בדיקות

| בדיקה | תוצאה |
|---|---|
| connect/disconnect בלי סשן → 401 | עבר |
| callback עם `user_id` ב־query → שגיאה בעברית | עבר |
| state שכבר נצרך לא ניתן לשימוש חוזר | עבר |
| בלי מפתחות Nylas: connect → 503 בעברית, אין mailbox חלקי | עבר (לפני הוספת המפתחות) |
| עם מפתחות: connect מחובר מחזיר URL של Nylas Hosted OAuth (`provider=google`) | עבר |
| Callback URI מקומי רשום באפליקציית Nylas | עבר |
| Google connector כולל `gmail.send` | עבר |
| חיבור Gmail אמיתי: mailbox `connected`, grant_id + אימייל נשמרים, provider=google | עבר |
| State של ה-callback המוצלח נצרך; state משומש לא ניתן לשימוש חוזר | עבר |
| שליחת בדיקה (`is_test`) דרך התיבה המחוברת, `provider_message_id` נשמר | עבר |
| נושא/גוף עברית RTL, קידומת `[בדיקה]`, כפתור «פתיחת הבקשה» | עבר |
| אותו `Idempotency-Key` לא יוצר שליחה כפולה | עבר |
| בקשת בדיקה מוסתרת מהדאשבורד | עבר |
| Magic Link בלי סשן בעלים → טופס; GET לא מסמן נפתח; אינטראקציה ראשונה → `in_progress` | עבר |
| שליחת טופס מעדכנת את הבקשה ל־`completed` והדאשבורד מציג «הושלם» | עבר |
| לא ניתן לשלוח דרך mailbox של משתמש אחר (בעלות + RLS) | עבר |
| ניתוק: סטטוס `disconnected`, grant נמחק ב-Nylas (404), אין הפעלה בלי תיבה מחוברת | עבר |

| פקודה | תוצאה |
|---|---|
| `npm run lint` | עבר |
| `npm run typecheck` | עבר |
| `npm run build` | עבר |

Phase 3 הושלם מול Gmail חי. אחרי בדיקת הניתוק התיבה במצב `disconnected` — לחבר מחדש מההגדרות לפני שליחה נוספת.

---

## Phase 4 — Cron, תזמונים ותזכורות

**תאריך:** 18 באוגוסט 2026  
**סטטוס:** קוד הושלם ונבדק מקומית. חסרים: הדבקת SQL לסטטוסים `completed`/`skipped`, חיבור Gmail מחדש, ו־Cron חי מול URL ציבורי.  
**השלב הבא:** ממתין לאישור לפני Phase 5 (AI Chat). לא התחיל.

### מה נבנה

- תזמון `send_now` / `once` / `weekly` / `monthly` ב־`Asia/Jerusalem`, שמירה כ־timestamptz UTC, בלי חישוב offset ידני (`date-fns-tz`)
- `once` בעבר נחסם בפרסום. `monthly.day` 31 מתאים ליום האחרון בחודש. אין drift: ההרצה הבאה נגזרת מהשעה המתוזמנת
- כיבוי ממושך: catch-up אחד ואז המועד העתידי הבא
- `POST /api/cron/tick` עם השוואת `CRON_SECRET` בטוחה, דחיית method אחר, תשובה עם counters בלבד
- Tick: claim workflows → יצירת Requests לפי `scheduled_for` המקורי → jobs → עדכון `next_run_at` → claim jobs → worker
- תזכורת רק אחרי שליחה מוצלחת: `reminder_due_at = sent_at + delay`, מפתח `send_reminder:{request_id}:{reminder_due_at}`
- בקשה `completed`/פג תוקף מבטלת תזכורת בלי לשלוח
- Pause / Resume / עריכה (מחשבת `next_run_at` אם התזמון השתנה, לא נוגעת ב-snapshot) / מחיקה רכה
- UI רשימת וורקפלואוס: תזמון, הרצה הבאה, פעילות אחרונה, בקשות פתוחות, סטטוס, פעולות
- `ENABLE_DEV_SCHEDULES=true` מקומית בלבד מאפשר `afterMinutes`. לא פועל ב־production

### קבצים שנוצרו או עודכנו

נוצרו: `src/lib/schedule/*`, `src/lib/cron/*`, `src/lib/jobs/keys.ts`, `supabase/migrations/0002_phase4_statuses.sql`

עודכנו: `src/app/api/cron/tick/route.ts`, `src/lib/jobs/worker.ts`, `src/lib/jobs/enqueue.ts`, `src/lib/requests/create.ts`, `src/lib/dates.ts`, `src/lib/env.ts`, `src/lib/workflow/publish.ts`, `src/lib/workflow/schema.ts`, `src/lib/email/render.ts`, `src/app/(app)/workflows/*`, `src/components/workflows/*`, `src/lib/i18n/he.ts`, `.env.example`

### בדיקות

| בדיקה | תוצאה |
|---|---|
| once בעתיד / בעבר | עבר |
| weekly יום ראשון (0) | עבר |
| monthly יום 31 בפברואר → 28 | עבר |
| מעבר שעון קיץ בישראל שומר 10:00 | עבר |
| next run בלי drift אחרי השהיית worker | עבר |
| pause/resume בלי backfill | עבר |
| מפתחות `send_email:` / `send_reminder:` יציבים | עבר |
| Cron GET → 405, בלי סוד → 401 | עבר |
| due workflow: Request אחד לכל נמען, אותו `scheduled_for` | עבר |
| שתי קריאות Cron מקבילות בלי כפילות | עבר |
| עריכת Workflow לא משנה snapshot קיים | עבר |
| completed מבטל תזכורת (לא נשלח מייל) | עבר |
| Cron חי מול Vercel / מייל מתוזמן / תזכורת בתיבה | ממתין — אין URL ציבורי, Gmail מנותק, וחסר SQL לסטטוסים |

| פקודה | תוצאה |
|---|---|
| `npm test` | עבר (12) |
| `npm run lint` | עבר |
| `npm run typecheck` | עבר |
| `npm run build` | עבר |

דוגמה מתוקנת: `weekday: 1` (יום שני) מ־18.08.2026 12:00 ישראל → `next_run_at` UTC `2026-08-24T07:00:00Z`, תצוגת ישראל `24.08.2026, 10:00`. הדוח הקודם (`2026-08-25`) נבע מ־`advanceOne` שהוסיף 7 ימים ל־`next_run_at` לא־מיושר במקום ליישר ל־`schedule.weekday`.

יש להדביק ב-Supabase SQL editor את `supabase/migrations/0002_phase4_statuses.sql` (`completed` ל-workflows, `skipped` ל-jobs). אין להגדיר `app_url` ב-Vault כ-localhost. Phase 5 לא התחיל.

