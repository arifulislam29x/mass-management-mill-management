# MessLedger Backend চালু ও Netlify-এর সঙ্গে যুক্ত করার নিয়ম

## কেন এই বার্তা দেখাচ্ছে
Netlify static frontend প্রকাশ করে। Express/Node.js API আলাদা server-এ চালু না থাকলে `/api/...` request কাজ করবে না। `VITE_API_BASE_URL` অবশ্যই চালু backend-এর base URL হতে হবে; শুধু variable তৈরি করলেই backend তৈরি হয় না।

## Render-এ Backend deploy
1. এই project-এর সব ফাইল GitHub repository-র root-এ push করুন। `render.yaml` root-এ থাকতে হবে।
2. Render dashboard-এ New → Blueprint নির্বাচন করে GitHub repository connect করুন।
3. Render `render.yaml` পড়ে `messledger-api` service তৈরি করবে। Persistent disk `/var/data`-এ mount হবে এবং SQLite database `/var/data/mess.db`-এ থাকবে।
4. Render service-এর Environment-এ `ALLOWED_ORIGIN`-এর value দিন আপনার Netlify site-এর সম্পূর্ণ origin, যেমন `https://YOUR-SITE.netlify.app` (শেষে slash দেবেন না)। Custom domain থাকলে comma দিয়ে দুটো origin দিতে পারেন।
5. Deploy শেষ হলে `https://YOUR-BACKEND.onrender.com/api/health` খুলুন। JSON-এ `status: ok` না এলে backend এখনো ready নয়।

## Netlify-তে Frontend যুক্ত করা
1. Netlify → Site configuration → Environment variables খুলুন।
2. `VITE_API_BASE_URL` নামে variable তৈরি করুন; value হবে Render service-এর base URL, যেমন `https://YOUR-BACKEND.onrender.com`। `/api` যোগ করবেন না এবং শেষে slash দেবেন না।
3. Save করে Deploys → Trigger deploy → Clear cache and deploy site দিন। Vite-এর `VITE_` variable build-time-এ বসে, তাই redeploy বাধ্যতামূলক।
4. Site খুলে Admin setup/login করুন।

## গুরুত্বপূর্ণ
- Render persistent disk-সহ paid service ব্যবহার করুন; ephemeral filesystem-এ SQLite data হারাতে পারে।
- `ALLOWED_ORIGIN` অবশ্যই Netlify site-এর exact origin হতে হবে।
- `SESSION_SECRET` গোপন রাখুন; frontend-এ কখনো দেবেন না।
- Backend deploy না হওয়া পর্যন্ত frontend-এ connection error দেখানো স্বাভাবিক।
- এই configuration API server ও SQLite persistence চালু করতে সাহায্য করে; এটি একা ledger-এর সব table-কে group-scoped করে না। বর্তমান source-এ group metadata আছে, কিন্তু সম্পূর্ণ multi-tenant ledger isolation ও member authentication আলাদা development কাজ। Production-এ একাধিক মেসের আর্থিক তথ্য রাখার আগে সেই কাজ শেষ ও security test করতে হবে।
