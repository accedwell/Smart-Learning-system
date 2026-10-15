"""The free built-in helper: answers without an AI key, at no cost.

It knows how Smart Learning works for each role, has short lesson notes on common school topics
(topics.py), and works some things out exactly: counting, sums, simple equations, times tables
and even/odd numbers. Replies are in English.
"""
import ast
import operator
import re

import topics

MAX_COUNT = 1000  # the highest number it will count to
MAX_RESULT = 10**12  # sums with bigger answers are refused, so nobody can make it work forever

ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def in_words(n: int) -> str:
    """0 to 999 999 in English words, e.g. 342 -> 'three hundred and forty-two'."""
    if n < 0:
        return "minus " + in_words(-n)
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        rest = n % 100
        return ONES[n // 100] + " hundred" + (" and " + in_words(rest) if rest else "")
    if n < 1_000_000:
        rest = n % 1000
        joiner = " and " if 0 < rest < 100 else " "
        return in_words(n // 1000) + " thousand" + (joiner + in_words(rest) if rest else "")
    return str(n)


# ---- how the app works, for each kind of user ----

APP_TOPICS = [
    (("password", "forgot", "reset", "log in", "login", "sign in", "can't get in", "cannot get in"),
     "To log in, use the email and password the school administrator gave you. The first time, you'll be "
     "asked to choose your own password. Forgot it? Click \"Forgot password?\" on the login page and follow "
     "the link we email you. You can change your password any time under My Profile."),
    (("sign up", "signup", "register an account", "create an account", "new account", "add user", "add a user"),
     "Nobody signs up on their own: the school administrator creates every account under Admin → Add user, "
     "and the new person gets a temporary password to change at first login."),
    (("online class", "live class", "join class", "join the class", "video", "camera", "microphone", "attendance", "register"),
     {"teacher": "Open the Online classes tab, schedule a class for one of your classes, and press Start when it's "
                 "time. Learners who join are marked in the register automatically (present or late), and you can "
                 "download the register afterwards.",
      "default": "Your teachers' online classes appear in the Online classes tab. When a class is live, press Join: "
                 "it happens right inside Smart Learning, and joining marks you present in the register. Allow the "
                 "browser to use your camera and microphone if it asks."}),
    (("quiz", "test", "practise", "practice", "check-in", "checkin", "marks", "score"),
     {"teacher": "Set a quiz in the Quizzes tab: write the questions yourself, or upload a question paper or study "
                 "guide under Papers and pick from the questions the system makes from it. A learner's first try "
                 "counts towards whether they are at risk; later tries are practice.",
      "parent": "Your child's quiz marks appear on your dashboard under Quiz Marks, and you get a notification "
                "each time they finish one.",
      "default": "Your teachers' quizzes are in the Quizzes tab, filtered by subject. Your first try counts; after "
                 "that you can retake a quiz to practise and see the answers. There is also a short check-in quiz."}),
    (("paper", "study guide", "upload", "ocr", "scan", "pdf"),
     {"teacher": "Under Papers, upload a question paper or study guide (PDF, Word or a photo). The system reads it, "
                 "even scanned pages, and suggests quiz questions: you only tick the ones you want.",
      "default": "Question papers your teachers share are in the Papers tab. Click one to open it."}),
    (("at risk", "at-risk", "struggling", "status", "on track"),
     "A learner's status comes from their first try at their teachers' tests: 80% and up is on track, 50% and "
     "up is \"watch\", and below 50% is at risk. Before any test, the check-in quiz is used. Teachers see it on "
     "their class list, and parents on their dashboard."),
    (("lesson", "assessment", "progress"),
     "Lessons are on the learner's Overview tab. View a lesson's assessment first, then mark the lesson complete: "
     "your progress goes up and your parent is told."),
    (("rate", "rating", "stars"),
     "Learners can rate the teachers of their own classes in the Rate tab (1 to 5 stars). Ratings are anonymous "
     "and the principal and HOD see only the totals."),
    (("class", "classes", "grade"),
     {"admin": "Set up classes under Admin → Classes: give each class a grade, subject and teacher, then add "
               "learners of that grade.",
      "default": "Classes are set up by the school administrator, who decides which learners and teacher are in "
                 "each one. Ask them if you're in the wrong class."}),
    (("link", "child", "my child", "children"),
     {"parent": "Your dashboard shows only the children the school administrator linked to your account. If one is "
                "missing, ask the administrator to link them.",
      "admin": "Link a parent to a learner under Admin → Users: open the parent and choose their child.",
      "default": "Parents see only the learners the administrator linked to their account."}),
    (("report", "department", "hod", "principal", "feedback"),
     {"hod": "In your HOD dashboard, mark whether each teacher's interventions are done and press Send report: the "
             "principal receives your department's attendance, performance and ratings.",
      "principal": "Department reports from HODs appear on your dashboard. Pick a teacher to see their ratings, "
                   "confirm their interventions, and send them feedback (they get a notification).",
      "default": "HODs send department reports to the principal, who can also send feedback to teachers."}),
    (("language", "translate", "isizulu", "afrikaans", "sesotho", "xhosa"),
     "Change the app's language with the language menu under your name: the whole app switches. This free "
     "helper itself answers in English; translating needs the AI assistant, which the school can switch on by "
     "adding an AI key."),
    (("profile", "phone", "email address", "change my name", "my details"),
     "Open My Profile (click your name) to change your name, phone number, email or password. School details like "
     "your grade or subject are managed by the administrator."),
]


def app_answer(text: str, role: str) -> str | None:
    for words, answer in APP_TOPICS:
        if any(re.search(r"\b" + re.escape(w) + r"\b", text) for w in words):
            if isinstance(answer, dict):
                return answer.get(role) or answer["default"]
            return answer
    return None


# ---- counting ----

def counting_lesson(text: str) -> str | None:
    if not re.search(r"\bcount(ing|s)?\b|\bskip.?count", text):
        return None
    step_m = re.search(r"\b(?:by|in)\s+(\d+)s?\b", text)
    to_m = re.search(r"\b(?:to|until|up to)\s+(\d+)\b", text)
    from_m = re.search(r"\bfrom\s+(\d+)\b", text)
    backwards = bool(re.search(r"\bback(wards?)?\b|\bdown\b", text))
    step = max(1, int(step_m.group(1))) if step_m else 1
    end = min(int(to_m.group(1)), MAX_COUNT) if to_m else None

    if backwards:
        start = min(int(from_m.group(1)), MAX_COUNT) if from_m else (end or 10)
        nums = list(range(start, -1, -step))[:60]
        return ("Counting backwards means taking one step down each time:\n" + ", ".join(map(str, nums)) +
                ("\n\nTry it out loud, then try starting from a different number!" if len(nums) < 60 else " …"))

    if step > 1:
        end = end or step * 10
        nums = list(range(step, end + 1, step))[:60]
        return (f"Counting in {step}s (skip counting) means adding {step} each time:\n" + ", ".join(map(str, nums)) +
                f"\n\nTip: each number is {step} more than the one before. Skip counting is how times tables "
                f"work: {step} × 3 = {step * 3} because it is the 3rd number in the list.")

    if end and end > 20:
        nums = list(range(1, end + 1))
        shown = ", ".join(map(str, nums[:100])) + (" …" if len(nums) > 100 else "")
        return (f"Here is counting from 1 to {end}:\n{shown}\n\nNotice the pattern: after each 9, the tens go up "
                "by one (19 → 20, 29 → 30). That's place value: the left digit counts tens, the right digit counts ones.")

    end = end or 10
    lines = "\n".join(f"{n} – {in_words(n)}" for n in range(1, end + 1))
    return ("Let's learn to count! Say each number out loud and touch one object (like a bead or a finger) "
            f"for each number:\n{lines}\n\nEach number is one more than the one before. When you're ready, ask me "
            "to \"count to 50\", \"count in 2s\" or \"count backwards from 20\".")


# ---- sums ----

OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
       ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow}


def evaluate(node):
    """Numbers, + - × ÷ and brackets only; nothing else in Python gets run."""
    if isinstance(node, ast.Expression):
        return evaluate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = evaluate(node.operand)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        left, right = evaluate(node.left), evaluate(node.right)
        if isinstance(node.op, ast.Pow) and (abs(right) > 20 or abs(left) > 10**6):
            raise ValueError("too big")
        result = OPS[type(node.op)](left, right)
        if abs(result) > MAX_RESULT:
            raise ValueError("too big")
        return result
    raise ValueError("not a sum")


WORD_OPS = [(r"\bmultiplied by\b|\btimes\b|×|\bx\b", "*"), (r"\bdivided by\b|÷|\bover\b", "/"),
            (r"\bplus\b|\badd\b", "+"), (r"\bminus\b|\btake away\b|\bsubtract\b", "-"),
            (r"\bto the power of\b|\^", "**"), (r"\bsquared\b", "**2")]


def sum_answer(text: str) -> str | None:
    expr = text.lower().replace(",", "")
    for pattern, sym in WORD_OPS:
        expr = re.sub(pattern, f" {sym} ", expr)
    candidates = re.findall(r"[\d.\s()+\-*/%]+", expr)
    candidate = max(candidates, key=len, default="").strip()
    if not re.search(r"\d\s*(\*\*|[+\-*/%])\s*[\d(]", candidate):
        return None
    try:
        value = evaluate(ast.parse(candidate, mode="eval"))
    except (SyntaxError, ValueError, ZeroDivisionError):
        if re.search(r"/\s*0(?!\.\d*[1-9])\b", candidate):
            return "You can't divide by 0: there is no number that, multiplied by 0, gives you something other than 0."
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    shown = round(value, 6) if isinstance(value, float) else value
    pretty = candidate.replace("**", "^").replace("*", "×").replace("/", "÷")
    pretty = re.sub(r"\s*([×÷^+\-%])\s*", r" \1 ", pretty)
    pretty = re.sub(r"\s+", " ", pretty).replace("( ", "(").replace(" )", ")").strip()
    pretty = re.sub(r"^- ", "-", pretty)
    tip = ""
    if re.fullmatch(r"\s*\d+\s*\*\s*\d+\s*", candidate):
        a, b = map(int, re.findall(r"\d+", candidate))
        if a <= 12 and b <= 12:
            tip = f"\nThink of it as {b} groups of {a}: " + " + ".join([str(a)] * b) + f" = {value}."
    return f"{pretty} = {shown}{tip}"


# ---- times tables and even/odd ----

def times_table(text: str) -> str | None:
    m = re.search(r"\b(\d+)\s*(?:times|multiplication)\s*tables?\b", text) or \
        re.search(r"\b(?:times|multiplication)\s*tables?\s*(?:of|for)?\s*(\d+)\b", text) or \
        re.search(r"\btable\s*(?:of|for)\s*(\d+)\b", text)
    if not m:
        return None
    n = int(m.group(1))
    if n > 1000:
        return "Let's stick to tables up to 1000."
    rows = "\n".join(f"{i} × {n} = {i * n}" for i in range(1, 13))
    return f"The {n} times table:\n{rows}\n\nTip: each answer is {n} more than the one before."


# ---- simple equations ----

def evaluate_x(node, x):
    """Like evaluate(), but the letter x is allowed."""
    if isinstance(node, ast.Expression):
        return evaluate_x(node.body, x)
    if isinstance(node, ast.Name) and node.id == "x":
        return x
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = evaluate_x(node.operand, x)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div):
        return OPS[type(node.op)](evaluate_x(node.left, x), evaluate_x(node.right, x))
    return evaluate(node)


def nice(v: float) -> str:
    v = round(v, 6)
    return str(int(v)) if float(v).is_integer() else str(v)


EQ_SIDE = r"[\dx.\s()+\-*/]"


def equation_answer(text: str) -> str | None:
    """Linear equations in x, e.g. 'solve 3x + 2 = 11', worked out step by step."""
    m = re.search(rf"({EQ_SIDE}+)=({EQ_SIDE}+)", text)
    if not m or "x" not in m.group(0):
        return None
    sides = []
    for raw in (m.group(1), m.group(2)):
        expr = re.sub(r"(\d|\))\s*(x|\()", r"\1*\2", raw.strip())  # 3x -> 3*x, 2(x+1) -> 2*(x+1)
        try:
            tree = ast.parse(expr, mode="eval")
            f0, f1, f2 = (evaluate_x(tree, v) for v in (0, 1, 2))
        except (SyntaxError, ValueError, ZeroDivisionError, TypeError):
            return None
        if abs((f2 - f1) - (f1 - f0)) > 1e-9:
            return "That equation isn't linear (it has x² or x in a fraction's bottom), so I can't solve it step by step yet."
        sides.append((f1 - f0, f0))  # (how many x, the number on its own)
    (a, b), (c, d) = sides
    if abs(a - c) < 1e-12:
        return "Every x cancels out, so " + ("any value of x works." if abs(b - d) < 1e-12 else "there is no solution.")
    x = (d - b) / (a - c)
    left, right = " ".join(m.group(1).split()), " ".join(m.group(2).split())
    coef = nice(a - c)
    x_terms = {"1": "x", "-1": "-x"}.get(coef, coef + "x")
    steps = [f"Solve {left} = {right}",
             f"Get the x terms on one side and the numbers on the other: {x_terms} = {nice(d - b)}"]
    if coef != "1":
        steps.append(f"Divide both sides by {coef}: x = {nice(x)}")
    steps.append(f"Check: put x = {nice(x)} back in – both sides give {nice(a * x + b)} ✓")
    return "\n".join([steps[0]] + [f"{i}. {s}" for i, s in enumerate(steps[1:], 1)])


def even_odd(text: str) -> str | None:
    m = re.search(r"\bis\s+(\d+)\s+(?:an?\s+)?(even|odd)\b", text)
    if not m:
        return None
    n = int(m.group(1))
    kind = "even" if n % 2 == 0 else "odd"
    return (f"{n} is {kind}. Even numbers end in 0, 2, 4, 6 or 8 and can be shared into 2 equal groups; odd "
            f"numbers end in 1, 3, 5, 7 or 9 and always leave 1 over.")


# ---- small talk ----

def small_talk(text: str, name: str) -> str | None:
    first = name.split()[0] if name else ""
    if re.fullmatch(r"\s*(hi|hello|hey|hallo|sawubona|molo|dumela|avuxeni|ndaa|lotjhani)\b.*", text) and len(text) < 30:
        return f"Hello{' ' + first if first else ''}! " + MENU
    if re.search(r"\b(thank|thanks|ngiyabonga|enkosi|dankie|kea leboha)\b", text):
        return "You're welcome! Ask me anything else about Smart Learning, or try a sum."
    if re.search(r"\b(help|what can you do|who are you)\b", text):
        return MENU
    return None


SUBJECTS = ("grammar, tenses, parts of speech, concord, passive voice, direct and indirect speech, punctuation, "
            "figures of speech, essays, fractions, percentages, algebra, equations, area, Pythagoras, "
            "trigonometry, photosynthesis, respiration, cells, DNA, Newton's laws, states of matter, atoms, "
            "electricity, the water cycle and study tips")

MENU = ("I'm the Smart Learning helper. I can:\n"
        f"• explain school topics – {SUBJECTS} (try \"explain tenses\")\n"
        "• explain how to use the app (quizzes, papers, online classes, passwords, your profile…)\n"
        "• teach counting – try \"teach me how to count\", \"count in 5s\" or \"count backwards from 20\"\n"
        "• work out sums – try \"what is 12 x 7\" or \"(15 + 5) / 4\"\n"
        "• solve equations step by step – try \"solve 3x + 2 = 11\"\n"
        "• show times tables – try \"7 times table\"\n"
        "• tell you if a number is even or odd – try \"is 37 even\"")


def answer(message: str, role: str = "", name: str = "", earlier: list[str] | None = None) -> str:
    """earlier: the helper's previous replies in this chat, so it doesn't repeat its long menu."""
    text = " ".join(message.lower().split())
    for skill in (counting_lesson, times_table, even_odd, equation_answer, sum_answer):
        reply = skill(text)
        if reply:
            return reply
    talk = small_talk(text, name)
    if talk:
        return talk
    # school topics before app help, so "how do I study for a test" gets study tips
    topic = topics.best_topic(text)
    if topic:
        return topic["notes"]
    reply = app_answer(text, role)
    if reply:
        return reply
    if any("I'm the Smart Learning helper" in r for r in (earlier or [])):
        return ("Sorry, I don't have notes on that yet. Topics I can explain: " + SUBJECTS + ". For any other "
                "question, the school can switch on the full AI assistant with a free Gemini key.")
    return "I'm not sure about that one. " + MENU
