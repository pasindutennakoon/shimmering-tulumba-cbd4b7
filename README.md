# Asiri Bollywood Night 2026 Ticketing System

This is a Netlify + Supabase web app for your event.

Core rule:

**Paid list = master ticket list. No one outside the paid list gets a QR.**

## Screens

1. Employee Portal
   - Employee enters EPF and contact number.
   - If EPF exists in paid master list and contact matches, QR pass is shown.
   - If the QR was already generated, the same QR is shown again.
   - It does not generate a second pass.

2. Admin Portal
   - Upload paid employees through CSV / Excel.
   - Add paid employees manually through + Add Paid Employee.
   - View QR generation status.
   - View checked-in status and entry time.
   - Remove mistaken records.

3. Security Portal
   - Scans QR at entrance.
   - Shows GO IN if valid and not used.
   - Shows ALREADY CHECKED IN if pass was already used.
   - Shows INVALID PASS if fake or not in system.
   - Shows employee name, EPF, contact and status.

## Database Table

`employees`

- employee_id: Primary key
- full_name: Employee name
- contact: Phone number
- ticket_status: Paid / Complimentary
- qr_token: Secret token
- qr_generated: Yes / No
- qr_generated_at: Time QR was first created
- checked_in: Yes / No
- checked_in_at: Entry time

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Copy and run the full code in `supabase-schema.sql`.
4. Go to Project Settings → API.
5. Copy:
   - Project URL
   - anon public key

## Local Setup

Install Node.js first.

```bash
npm install
cp .env.example .env
npm run dev
```

Edit `.env`:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_PASSCODE=your-admin-password
VITE_SECURITY_PASSCODE=your-security-password
```

## Netlify Hosting

1. Upload this project to GitHub.
2. Go to Netlify.
3. Add new site from Git.
4. Select your GitHub repository.
5. Build command: `npm run build`
6. Publish directory: `dist`
7. Add environment variables in Netlify:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_ADMIN_PASSCODE
   - VITE_SECURITY_PASSCODE
8. Deploy.

## Upload File Format

Use CSV or Excel with these columns:

```csv
employee_id,full_name,contact,ticket_status
12345,Nimal Perera,0771234567,Paid
12346,Kushani Silva,0777654321,Complimentary
```

Accepted alternative column names:

- employee_id or EPF
- full_name or Full Name or Name
- contact or mobile or phone
- ticket_status or status

## Event Rule

One EPF = One QR Pass = One Entry.

After first successful scan, the pass becomes used.

Second scan shows:

**ALREADY CHECKED IN**

## Blunt Security Note

This is suitable for an internal staff event. It is not bank-grade security because the admin/security passcodes are frontend environment variables. For your event, that is likely enough if the URL is not shared publicly. For a public paid event, use Supabase Auth and server-side functions.
