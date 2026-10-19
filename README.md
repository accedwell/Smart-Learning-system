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

### Text messages (SMS)

SMS go out through [textbee](https://textbee.dev), which sends them from an Android phone, so they use that phone's airtime or bundle.

1. Install the textbee app on an Android phone with a SIM card, and create an account at textbee.dev.
2. Register the phone in the textbee dashboard, then copy the **API key** and the **device ID**.
3. Add them to `backend/.env` as `TEXTBEE_API_KEY=...` and `TEXTBEE_DEVICE_ID=...`, then restart the backend.

The app then sends:

- **Parents:** a text when their child completes a lesson or hands in the first try at a quiz, with a warning if the mark puts the child at risk. Practice retakes don't send texts.
- **Learners:** a text when their teacher schedules an online class.
- **The administrator:** any message, to any numbers, from the **SMS** tab in the mobile app.

Texts only go to people whose phone number is saved. People add their own under My Profile, or the administrator adds it in the mobile app (Users → Phone). Local numbers like `082 123 4567` get South Africa's code; change `SMS_COUNTRY_CODE` for another country. Until textbee is set up, each SMS is written to the backend's log instead of being sent.

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

## Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Starts the API and restarts it when files change |
| backend | `npm start` | Starts the API |
| backend | `npm run create-admin` | Creates a school administrator |
| frontend | `npm run dev` | Starts the development server |
| frontend | `npm run build` | Builds the app for production |
| frontend | `npm run lint` | Checks the code with oxlint |
