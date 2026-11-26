# Netlify-তে MessLedger Deploy করার সঠিক নিয়ম

## ১) ZIP Extract করুন
ZIP extract করার পর `messledger-work` নামে কোনো অতিরিক্ত parent folder থাকলে তার ভেতরে ঢুকুন। `package.json`, `index.html`, `netlify.toml`, `src/` এবং `public/` একই root-এ থাকতে হবে। এই ZIP-এ ফাইলগুলো ইতিমধ্যে root-এ সাজানো আছে।

## ২) GitHub-এ Upload করুন
এই প্রজেক্টের ভেতরের সব ফাইল ও ফোল্ডার GitHub repository-র root-এ upload/push করুন। ZIP ফাইলটিকে সরাসরি repository-তে রেখে দেবেন না; ZIP extract করে তার ভেতরের project files upload করুন।

## ৩) Netlify সেটিংস
- Build command: `npm run build`
- Publish directory: `dist`
- Base directory: খালি রাখুন (অথবা `.`)
- Node version: `22` (প্রজেক্টের `.nvmrc` অনুসরণ করুন)

`netlify.toml`-এ এই সেটিংস সংরক্ষিত আছে। GitHub repository-র root-এ `netlify.toml` থাকতে হবে।

## ৪) Deploy
Netlify Dashboard → Site configuration → Build & deploy → Continuous deployment থেকে সঠিক GitHub repository এবং branch নির্বাচন করুন। এরপর Deploys → Trigger deploy → Clear cache and deploy site দিন। Build শেষ হলে Deploy log-এ `vite build` সফল এবং `dist` তৈরি হয়েছে কি না দেখুন।

## ৫) Backend সংযোগ
Netlify কেবল frontend static hosting করে। Express + SQLite backend Netlify-তে এইভাবে চালু হবে না। Backend-কে persistent disk-সহ Node hosting-এ deploy করুন, তারপর Netlify Site configuration → Environment variables-এ `VITE_API_BASE_URL` নামে backend-এর HTTPS base URL দিন। এরপর নতুন করে frontend deploy করুন।

## ৬) ফোনে Install
সাইট HTTPS-এ চালু হলে Android Chrome-এ `অ্যাপ ইনস্টল` বাটন বা browser menu থেকে Install app নির্বাচন করুন। iPhone-এ Safari → Share → Add to Home Screen ব্যবহার করুন। Browser ব্যবহারকারীর অনুমতি ছাড়া স্বয়ংক্রিয়ভাবে APK download বা app install করতে পারে না। এই প্রজেক্টটি PWA; আলাদা Android APK এখনো তৈরি করা হয়নি।

## ৭) 404 হলে
- নিশ্চিত করুন `index.html`, `package.json`, `netlify.toml` GitHub repository-র root-এ আছে।
- Netlify Base directory ভুল করে `messledger-work` বা অন্য কোনো folder দেওয়া থাকলে ঠিক করুন।
- Publish directory অবশ্যই `dist` হবে।
- Deploy log-এ build সফল না হলে 404 নয়, আগে build error ঠিক করতে হবে।
- Deploy-এর পর `https://আপনার-সাইট-ডোমেইন/` খুলে পরীক্ষা করুন।

## গুরুত্বপূর্ণ
Group-based data isolation, member authentication এবং persistent multi-tenant database এখনো সম্পূর্ণ বাস্তবায়িত নয়। Production-এ বাস্তব আর্থিক তথ্য ব্যবহারের আগে এগুলো সম্পূর্ণ করা এবং security review করা আবশ্যক।
