# ForecastLab — RDM 2301 & MHM 7223

Interactive demand-forecasting teaching tool for Revenue & Pricing Management.
Jumeirah Beach Hotel Dubai (599 rooms) · Dr. Mahala Geronasso · ADHA – Les Roches

Four forecasting methods (Naïve, Moving Average, Weighted MA, Exponential Smoothing)
with live controls, five error metrics on a holdout window, a graded student
assignment that produces a submission code, and a password-protected instructor
console that decodes and auto-grades those codes.

---

## Run locally

You need Node.js (18 or newer). Then:

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

## Build for production

```bash
npm run build
```

The finished site lands in the `dist/` folder.

---

## Deploy to Vercel

1. Push this folder to a new GitHub repository.
2. Go to vercel.com → **Add New → Project** → import the repo.
3. Vercel auto-detects Vite. Leave the defaults:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Click **Deploy**. You get a public link in about a minute.

Students open that link. Only you have the instructor password.

---

## Before sharing with students

Open `src/ForecastLab.jsx` and change this line near the top of the
assessment section:

```js
const INSTRUCTOR_PASSWORD = "rdm2301"; // change before sharing with students
```

Set it to something only you know.

---

## How grading works

- Students answer on the **Assignment** tab, then click *Generate submission
  code* and paste the resulting `RDM2301-...` code into Moodle.
- You open the **Instructor** tab, enter your password, paste a student's code,
  and click *Decode*. Numeric and multiple-choice answers are graded
  automatically; written answers get a manual points slider.
- The score breaks down across the five rubric criteria (100 points total).
- A checksum flags codes that look hand-edited.

> Note: the class roster lives only in your browser session. Copy scores into
> Moodle before closing the tab.
