# Smart Learning

A school learning platform where every learner is taught, tracked and supported in one place. Learners, teachers, parents, heads of department, principals and the school administrator each get their own dashboard, and the whole app works in all eleven of South Africa's official languages.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-chatbot-009688?logo=fastapi&logoColor=white)

## Features

**Learners**
- Lessons and assessments for their grade
- Quizzes from their teachers: the first try counts, after that they can practise as often as they like and see the right answers
- Question papers and study guides for their classes
- Online classes held inside the app, with video, audio and chat
- Rate their teachers anonymously

**Teachers**
- Their classes, with each learner shown as *on track*, *watch* or *at risk* from their test results
- Upload a question paper or study guide (PDF, Word or a photo): the system reads it, with OCR for scans, and writes quiz questions; the teacher only ticks the ones they want
- Set quizzes by hand, with an optional time limit, and see every learner's marks
- Schedule and teach online classes; the class register fills itself in as learners join, with the minutes each one attended

**Parents** follow their linked children's progress and quiz marks.

**Heads of Department** follow their department's teachers, escalate concerns and send reports to the principal.

**Principals** oversee every teacher, read the HODs' reports and send feedback.

**The administrator** creates every account (nobody signs up themselves), links parents to learners and sets up the classes.

**Everyone**
- The whole interface in English, Afrikaans, isiZulu, isiXhosa, isiNdebele, Sepedi, Sesotho, Setswana, siSwati, Tshivenda and Xitsonga
- An AI support assistant (chat bubble) that answers in the language the person chooses
- Password reset by email

## Built with

| Part | Technology |
|---|---|
| Frontend | React 19, Vite 8, Immer |
| Backend | Node.js 22+, Express 5, MySQL 8 (mysql2), JWT sign-in, bcrypt |
| Online classes | WebRTC (browser to browser), with the backend relaying the connection set-up and chat |
| Reading documents | Tesseract.js (OCR), pdf.js, Mammoth (Word files) |
| Chatbot | Python, FastAPI, Uvicorn |
| AI | Claude, via the Anthropic API (optional) |

## Project structure

```
Smart-Learning-system/
├── smart_learning/
│   ├── frontend/    React app: a dashboard per role (learner/, teacher/, parent/, hod/,
│   │                principal/, admin/) and shared code in src/
│   ├── backend/     Express API: a route folder per role, lib/ for shared logic,
│   │                db/schema.sql for the database
│   ├── chatbot/     The Python support assistant behind the chat bubble
│   └── mobile/      The phone app (Expo / React Native), for every role
└── proact_prototype.html   The original single-page prototype
```

## Getting started

### What you need

- Node.js 22.12 or newer
- MySQL 8
- Python 3.11 or newer (only for the chatbot)

### 1. Backend

```bash
cd smart_learning/backend
npm install
cp .env.example .env
```

Open `.env` and fill in at least:

- `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD`: your MySQL server
- `JWT_SECRET`: a long random value
- `CHATBOT_SECRET`: another long random value

The command `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` prints one.

Then start it:

```bash
npm run dev
```

On its first start the backend creates the `smart_learning` database and its tables, and, in development, a demo school (see [Demo accounts](#demo-accounts)).

### 2. Frontend

```bash
cd smart_learning/frontend
npm install
npm run dev
```

Open the address it prints, usually http://localhost:5173. If the backend runs on a port other than 4000, create `frontend/.env` with `API_URL=http://localhost:<port>`.

### 3. Chatbot (optional)

```bash
cd smart_learning/chatbot
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # macOS/Linux: .venv/bin/pip
.venv/Scripts/python app.py                       # macOS/Linux: .venv/bin/python
```

The chatbot reads its settings from `backend/.env` and listens only on this computer, on port 8000. Only the backend can use it, with the shared `CHATBOT_SECRET`.

### 4. Mobile app (optional)

The phone app has every role's dashboard and uses the same backend, accounts and translations as the website.

```bash
cd smart_learning/mobile
npm install
npx expo start
```

Install **Expo Go** on an Android phone or iPhone, connect it to the same Wi-Fi as the computer, and scan the QR code. The app finds the backend on that computer, on port 4001. To use another address, create `mobile/.env` with `EXPO_PUBLIC_API_URL=http://<address>:4001/api`. If the phone can't connect, allow Node.js through the Windows firewall.

Joining a live online class opens the website's classroom in the phone's browser. For that, start the frontend with `npm run dev -- --host` so the phone can reach it.

### AI features

The AI features need an Anthropic API key. Add `ANTHROPIC_API_KEY=...` to `backend/.env` and restart the backend and the chatbot. The features are:

- the chat assistant
- AI-written quiz questions from uploaded papers
- study tips for learners
- intervention suggestions for teachers and HODs

Without a key, everything else works, and quizzes from uploaded papers are still made from the document's text without AI.

**Free option for the chat assistant:** Google Gemini has a free tier. Get a key (no card needed) at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), put it in `backend/.env` as `GEMINI_API_KEY=...`, and restart the chatbot. The chat uses Claude when `ANTHROPIC_API_KEY` is set, otherwise Gemini. Google may use free-tier chats to improve its products, so learners shouldn't type personal details into the chat.

With no key at all, a built-in helper answers in the chat. It explains how to use the app and teaches counting, sums, times tables and even/odd numbers. It also answers if Gemini fails, for example once the free daily limit is used up.

## Demo accounts

In development the backend adds a demo school. Every demo account's password is `Demo@1234`.

The administrator, principal and HOD also need the 6-digit sign-in code that is emailed to them (see [Security](#security)).

| Role | Email |
|---|---|
| Administrator | `pillay@school.demo` |
| Principal | `sithole@school.demo` |
| Head of Department | `dlamini.hod@school.demo` |
| Teacher | `dlamini@school.demo` |
| Parent | `nomsa@school.demo` |
| Learner | `thabo@school.demo` |

For a real school, turn the demo off (`SEED_DEMO_DATA=false` or `NODE_ENV=production`). Then create the first administrator:

```bash
cd smart_learning/backend
npm run create-admin -- --name "Jane Doe" --email jane@school.org
```

The administrator then adds everyone else from their dashboard.

## Security

### Protections in place

| Protection | What it stops |
|---|---|
| Passwords hashed with bcrypt | Stolen database records don't reveal anyone's password |
| Signed sign-in tokens (JWT) that expire after 8 hours | Faked logins, and sessions that stay open forever |
| Tokens cancelled when a password changes or is reset | A stolen token stops working once the password is changed |
| Role checks on every API route | Learners opening teacher or admin pages, or parents seeing children who aren't theirs |
| Rate limit on sign-in and password reset (20 tries per 15 minutes) | Password guessing |
| **Account lockout:** 5 wrong passwords (or sign-in codes) in a row lock the account for 15 minutes, and the owner is emailed (a learner's parent, for a learner). A password reset or the administrator's Unlock button ends it early | Guessing one account's password |
| **Two-step sign-in for staff:** administrators, principals and HODs also type a 6-digit code emailed to them. The code lasts 10 minutes. Asking again in that time emails the same code, so any of those emails works. It works once, and only a random seed is stored (the code also needs the server's secret) | Someone who stole or guessed a staff password |
| **Security log:** sign-ins, wrong passwords, lockouts, sign-in codes, password changes and resets, and accounts created or removed, with the time, IP address and device. The administrator reads it on the Security tab (web and phone) and can filter it | Attacks going unnoticed |
| **Login alerts:** a sign-in from a device the account hasn't used before emails the owner (a learner's parents) the time, device and IP address, with what to do if it wasn't them. The website and phone app each keep a random device id for this | Someone signing in with a stolen password without the owner knowing |
| **Automatic sign-out after 30 minutes without activity**, with a one-minute warning. A playing video (an online class) counts as activity, and a page refresh or reopening the phone app doesn't restart the clock | Someone using a shared school computer or a phone left signed in |
| Rate limits on emails, chat, AI and quiz generation | Flooding the system or running up AI costs |
| Parameterised SQL queries | SQL injection |
| Helmet security headers | Common browser attacks such as clickjacking and content-type sniffing |
| CORS allow-list | Websites other than Smart Learning calling the API |
| Upload checks (size limit, allowed types, file contents checked, random file names) | Huge files, disguised files and path tricks |
| Password length rules (8 to 128 characters) | Very short passwords |
| Temporary passwords that must be changed at first sign-in | Emailed passwords staying in use |
| Password reset links that last one hour, work once and are stored hashed | Old or leaked reset emails being reused |
| The same "wrong email/ID number or password" message in every case | Finding out which accounts exist |
| No self sign-up: only the administrator creates accounts | Strangers creating accounts |
| Chatbot reachable only from the backend, with a shared secret | Direct use of the chatbot from outside |
| Secrets kept in `.env`, which git ignores | Passwords and keys being published on GitHub |

### Planned improvements

1. **Stronger passwords:** require letters and numbers, and block common passwords such as `Password123`.
2. **HTTPS** once the system runs on a server.
3. **Dependency checks:** run `npm audit` and `pip-audit` regularly.
4. **A MySQL user with limited rights:** it can read and write data but can't drop tables.
5. **Regular database backups.**

### Keeping your installation safe

- Use long random values for `JWT_SECRET` and `CHATBOT_SECRET`, and never commit `.env`.
- Turn the demo school off for real use (`SEED_DEMO_DATA=false` or `NODE_ENV=production`), because its password is public.
- Staff sign-in codes need working email (`SMTP_*` in `.env`). Without SMTP the code is only written to the backend log. While the demo school is on, emails for the demo `@school.demo` addresses go to the school's sending mailbox (`SMTP_USER`), marked with the account they were for.
- Use a Gmail app password for email, not your real password, and revoke it when you no longer need it.

## Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Starts the API and restarts it when files change |
| backend | `npm start` | Starts the API |
| backend | `npm run create-admin` | Creates a school administrator |
| frontend | `npm run dev` | Starts the development server |
| frontend | `npm run build` | Builds the app for production |
| frontend | `npm run lint` | Checks the code with oxlint |
