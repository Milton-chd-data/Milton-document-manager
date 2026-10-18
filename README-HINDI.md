# Milton Document Manager (free starter app)

Yeh responsive web app mobile aur Windows computer ke browser par chalti hai. PDFs private cloud storage mein save hote hain. Sign-in ke baad aap document upload, search, open aur delete kar sakte hain.

## Free services
- GitHub Pages: app ka frontend publish karne ke liye.
- Supabase Free: email/password login, database aur 1 GB file storage (current free-plan limits apply).
- Is starter ko banane ke liye paid plan ki zaroorat nahi hai, jab tak aap free-plan limits ke andar rehte hain.

Supabase Free projects inactivity ke baad pause ho sakte hain. Free plan limits aur terms badal sakte hain.

## Step 1: Supabase project banayein
1. https://supabase.com par account banayein.
2. New project par click karein. Project name `milton-document-manager` rakh sakte hain.
3. Database password ko safe jagah note karein. Is app ke code mein is password ki zaroorat nahi hai.
4. Project banne ke baad project ke SQL Editor mein jaayein.
5. `supabase-setup.sql` file ka poora code copy karke SQL Editor mein paste karein aur Run karein.
6. Project Settings / Connect section mein Project URL aur Publishable key copy karein. Sirf public/publishable key use karein, `service_role` ya secret key kabhi bhi browser code mein na daalein.

## Step 2: App configure karein
1. `app.js` file kholein.
2. Upar ki do lines mein:
   - `YOUR_SUPABASE_URL` ko apne Project URL se replace karein.
   - `YOUR_SUPABASE_PUBLISHABLE_KEY` ko apni publishable key se replace karein.
3. Save karein.

## Step 3: GitHub par upload karein
1. https://github.com par sign in karein.
2. New repository banayein, naam `milton-document-manager` rakhein.
3. Repository public rakhein (GitHub Free par Pages ke liye sabse seedha setup).
4. Add file > Upload files choose karein.
5. Is folder ki `index.html`, `style.css`, `app.js` aur `supabase-setup.sql` files upload karein. README bhi upload kar sakte hain.
6. Commit changes karein.

## Step 4: GitHub Pages on karein
1. Repository > Settings > Pages kholein.
2. Build and deployment mein `Deploy from a branch` choose karein.
3. Branch `main`, folder `/(root)` select karein, phir Save karein.
4. Kuch minute baad site ka URL dikhega, aam taur par `https://YOUR-USERNAME.github.io/milton-document-manager/`.

## Step 5: App test karein
1. Published URL kholein.
2. Email aur kam se kam 6-character password enter karke Create account dabayein.
3. Agar email confirmation on hai, inbox mein confirmation link kholein, phir app par wapas aakar sign in karein.
4. Ek test PDF upload karein. Phir Open PDF, search aur Delete test karein.
5. Same URL mobile aur computer par kholkar same account se sign in karein.

## Security notes
- PDF bucket private hai. App signed URL banata hai jo sirf 60 seconds ke liye valid hota hai.
- Database aur file storage policies har logged-in user ko sirf apne documents access karne deti hain.
- `app.js` mein Supabase publishable key rakhna normal hai. Secret/service-role key kabhi frontend ya GitHub par upload na karein.
- Agar yeh sensitive company records hain, pehle dummy/test PDFs se test karein aur company ki IT/security policy se approval lein.
- Yeh starter version backup/export, multi-user shared folders, audit log aur password reset UI include nahi karta. Supabase dashboard se account access aur project usage monitor karein.
- GitHub repository public hogi, isliye usmein sirf app code rakhein. Actual PDFs ya confidential records repository mein upload na karein.
