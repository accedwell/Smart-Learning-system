"""Short lesson notes the free helper can give without AI: common school topics in English,
Mathematics, Life and Physical Sciences, and study skills.

Each topic has `words` (what a learner might type; the topic whose words match best is chosen)
and `notes` (the explanation). An "overview" topic lists the topics under it, so "explain grammar"
gets the list and "explain tenses" gets that topic.
"""

TOPICS = [
    # ---- English grammar ----
    {"words": ["grammar", "grammar concepts", "language structures", "language rules"],
     "notes": "Grammar is the set of rules for building correct sentences. The main concepts are:\n"
              "• Parts of speech – noun, verb, adjective, adverb, pronoun, preposition, conjunction\n"
              "• Tenses – past, present and future\n"
              "• Concord – the verb agrees with its subject\n"
              "• Sentence types – simple, compound and complex\n"
              "• Active and passive voice\n"
              "• Direct and indirect (reported) speech\n"
              "• Punctuation\n"
              "Ask me about any one of them, e.g. \"explain tenses\" or \"what is passive voice\"."},
    {"words": ["parts of speech", "noun", "nouns", "verb", "verbs", "adjective", "adjectives", "adverb", "adverbs",
               "pronoun", "pronouns", "preposition", "prepositions", "conjunction", "conjunctions"],
     "notes": "The parts of speech are the jobs words do in a sentence:\n"
              "• Noun – a person, place, thing or idea: teacher, Durban, book, happiness\n"
              "• Pronoun – stands in for a noun: he, she, it, they, we\n"
              "• Verb – an action or state: run, write, is\n"
              "• Adjective – describes a noun: a tall tree, a red car\n"
              "• Adverb – describes a verb, adjective or adverb, often ends in -ly: she ran quickly\n"
              "• Preposition – shows position or time: on, under, before, after\n"
              "• Conjunction – joins words or sentences: and, but, because, although\n"
              "• Interjection – shows feeling: Wow! Ouch!\n"
              "Example: \"The (article) clever (adjective) girl (noun) quickly (adverb) solved (verb) it (pronoun).\""},
    {"words": ["tense", "tenses", "past tense", "present tense", "future tense", "continuous", "perfect tense"],
     "notes": "Tense shows WHEN something happens.\n"
              "• Present simple: I walk to school. (habit / fact)\n"
              "• Present continuous: I am walking to school. (happening now)\n"
              "• Past simple: I walked to school yesterday.\n"
              "• Past continuous: I was walking when it rained.\n"
              "• Present perfect: I have walked there before. (past action linked to now)\n"
              "• Past perfect: I had walked home before he called. (the earlier of two past actions)\n"
              "• Future: I will walk / I am going to walk tomorrow.\n"
              "Tip: in an essay, stay in one tense unless the time really changes."},
    {"words": ["concord", "subject verb agreement", "subject-verb agreement", "agreement"],
     "notes": "Concord means the verb must agree with its subject in number.\n"
              "• Singular subject → singular verb: The boy plays.\n"
              "• Plural subject → plural verb: The boys play.\n"
              "Tricky cases:\n"
              "• \"Each\", \"everyone\", \"nobody\" are singular: Everyone is here.\n"
              "• Ignore the words in between: The box of apples IS heavy (the subject is \"box\").\n"
              "• \"Neither/either … or/nor\": the verb agrees with the nearer subject: Neither the teacher nor the learners ARE late."},
    {"words": ["passive", "passive voice", "active voice", "active and passive"],
     "notes": "Active voice: the subject DOES the action. → The learner wrote the essay.\n"
              "Passive voice: the subject RECEIVES the action. → The essay was written by the learner.\n"
              "How to change active to passive:\n"
              "1. Make the object (the essay) the new subject.\n"
              "2. Use the right form of \"to be\" in the same tense (was) + the past participle (written).\n"
              "3. Add \"by\" + the doer if needed.\n"
              "Present: Thabo cleans the room → The room is cleaned by Thabo.\n"
              "Future: She will sing the song → The song will be sung by her."},
    {"words": ["direct speech", "indirect speech", "reported speech", "direct and indirect"],
     "notes": "Direct speech gives the exact words in quotation marks: She said, \"I am tired.\"\n"
              "Indirect (reported) speech reports them without quotation marks: She said that she was tired.\n"
              "Rules when the reporting verb is in the past:\n"
              "• Move the tense one step back: am → was, will → would, have done → had done\n"
              "• Change pronouns: I → she/he, we → they\n"
              "• Change time and place words: today → that day, tomorrow → the next day, here → there\n"
              "• Questions: He asked, \"Where do you live?\" → He asked where I lived.\n"
              "• Commands: She said, \"Sit down.\" → She told me to sit down."},
    {"words": ["sentence types", "simple sentence", "compound sentence", "complex sentence", "clause", "clauses"],
     "notes": "• A clause is a group of words with a subject and a verb.\n"
              "• Simple sentence – one main clause: The bell rang.\n"
              "• Compound sentence – two main clauses joined by and, but, or, so: The bell rang, and we went home.\n"
              "• Complex sentence – a main clause + a dependent clause (because, when, although, which): "
              "We went home because the bell rang.\n"
              "The dependent clause can't stand alone: \"because the bell rang\" is not a full sentence."},
    {"words": ["punctuation", "comma", "commas", "apostrophe", "full stop", "semicolon", "colon", "quotation marks"],
     "notes": "Main punctuation marks:\n"
              "• Full stop (.) ends a statement. Question mark (?) ends a question. Exclamation mark (!) shows strong feeling.\n"
              "• Comma (,) separates items in a list, and goes after an introductory phrase: After school, we ate.\n"
              "• Apostrophe (') shows ownership (the girl's bag, the girls' bags) or a missing letter (don't = do not). "
              "Its = belonging to it; it's = it is.\n"
              "• Colon (:) introduces a list or explanation. Semicolon (;) joins two closely linked sentences.\n"
              "• Quotation marks (\" \") show someone's exact words."},
    {"words": ["figure of speech", "figures of speech", "simile", "metaphor", "personification", "alliteration",
               "hyperbole", "onomatopoeia"],
     "notes": "Figures of speech make writing vivid:\n"
              "• Simile – compares using \"like\" or \"as\": as brave as a lion\n"
              "• Metaphor – says something IS something else: The classroom was a zoo.\n"
              "• Personification – gives human qualities to things: The wind whispered.\n"
              "• Hyperbole – deliberate exaggeration: I've told you a million times.\n"
              "• Alliteration – repeated first sounds: Peter Piper picked peppers.\n"
              "• Onomatopoeia – words that sound like their meaning: buzz, bang, sizzle.\n"
              "In an exam, name the figure AND explain its effect."},
    {"words": ["essay", "essay writing", "write an essay", "paragraph", "introduction", "conclusion"],
     "notes": "A good essay has:\n"
              "1. Introduction – catch the reader's interest and state your main idea.\n"
              "2. Body paragraphs – one main point per paragraph: a topic sentence, then explanation and examples.\n"
              "3. Conclusion – sum up and end strongly; don't add new points.\n"
              "Plan first (a quick mind map), use linking words (firstly, however, therefore), and leave time to check "
              "spelling, tense and concord."},

    # ---- Mathematics ----
    {"words": ["fraction", "fractions", "numerator", "denominator", "add fractions", "simplify"],
     "notes": "A fraction is part of a whole: in 3/4, the denominator (4) is how many equal parts, the numerator (3) "
              "how many we have.\n"
              "• Simplify: divide top and bottom by the same number: 6/8 = 3/4.\n"
              "• Add/subtract: make the denominators the same first: 1/2 + 1/3 = 3/6 + 2/6 = 5/6.\n"
              "• Multiply: top × top, bottom × bottom: 2/3 × 3/4 = 6/12 = 1/2.\n"
              "• Divide: flip the second fraction and multiply: 1/2 ÷ 1/4 = 1/2 × 4/1 = 2."},
    {"words": ["percentage", "percentages", "percent", "%", "discount", "vat"],
     "notes": "Per cent means \"out of 100\": 25% = 25/100 = 0.25.\n"
              "• Percentage of an amount: 20% of R150 = 0.20 × 150 = R30.\n"
              "• As a percentage: 18 out of 24 = 18 ÷ 24 × 100 = 75%.\n"
              "• Increase by 15% (e.g. VAT): multiply by 1.15. Decrease by 10% (a discount): multiply by 0.90.\n"
              "• Percentage change = (new − old) ÷ old × 100."},
    {"words": ["algebra", "variable", "expression", "like terms", "simplify expressions"],
     "notes": "Algebra uses letters (variables) for unknown numbers.\n"
              "• Like terms have the same letter part: 3x and 5x are like terms; 3x and 3x² are not.\n"
              "• Simplify by adding like terms: 3x + 5x − 2 = 8x − 2.\n"
              "• Expand brackets: 2(x + 4) = 2x + 8; (x + 2)(x + 3) = x² + 5x + 6.\n"
              "• Factorise is the reverse: x² + 5x + 6 = (x + 2)(x + 3).\n"
              "Type an equation like \"solve 3x + 2 = 11\" and I'll work it out step by step."},
    {"words": ["equation", "equations", "solve for x", "linear equation"],
     "notes": "To solve an equation, do the same thing to both sides until x is alone.\n"
              "Example: 3x + 2 = 11\n"
              "1. Subtract 2 from both sides: 3x = 9\n"
              "2. Divide both sides by 3: x = 3\n"
              "3. Check: 3(3) + 2 = 11 ✓\n"
              "Type your own, e.g. \"solve 5x - 4 = 21\", and I'll show the steps."},
    {"words": ["area", "perimeter", "rectangle", "circle", "triangle area", "volume"],
     "notes": "Perimeter is the distance around a shape; area is the space inside it.\n"
              "• Rectangle: perimeter = 2(l + b); area = l × b\n"
              "• Square: perimeter = 4s; area = s²\n"
              "• Triangle: area = ½ × base × height\n"
              "• Circle: circumference = 2πr; area = πr² (π ≈ 3.14)\n"
              "• Volume of a rectangular prism = l × b × h\n"
              "Always write the units: cm for perimeter, cm² for area, cm³ for volume."},
    {"words": ["pythagoras", "theorem of pythagoras", "hypotenuse", "right angled triangle", "right-angled triangle"],
     "notes": "In a right-angled triangle, the hypotenuse (c) is the longest side, opposite the right angle.\n"
              "Pythagoras: a² + b² = c²\n"
              "Example: sides 3 and 4 → c² = 9 + 16 = 25, so c = 5.\n"
              "To find a shorter side: a² = c² − b²."},
    {"words": ["trigonometry", "sin", "cos", "tan", "sohcahtoa"],
     "notes": "In a right-angled triangle, for an angle θ:\n"
              "• sin θ = opposite ÷ hypotenuse\n"
              "• cos θ = adjacent ÷ hypotenuse\n"
              "• tan θ = opposite ÷ adjacent\n"
              "Remember: SOH CAH TOA. Label the sides from the angle you're working with first."},

    # ---- Life Sciences ----
    {"words": ["photosynthesis", "chlorophyll", "chloroplast"],
     "notes": "Photosynthesis is how green plants make food (glucose) using light energy.\n"
              "carbon dioxide + water → glucose + oxygen (light and chlorophyll needed)\n"
              "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂\n"
              "• It happens in the chloroplasts, mainly in the leaves.\n"
              "• Chlorophyll (the green pigment) absorbs the light.\n"
              "• Rate increases with more light, CO₂ and a suitable temperature."},
    {"words": ["respiration", "cellular respiration", "aerobic", "anaerobic", "mitochondria"],
     "notes": "Cellular respiration releases energy from food in every living cell.\n"
              "• Aerobic (with oxygen), in the mitochondria: glucose + oxygen → carbon dioxide + water + energy (lots of ATP).\n"
              "• Anaerobic (without oxygen): in muscles, glucose → lactic acid + a little energy; in yeast, "
              "glucose → alcohol + carbon dioxide + a little energy (fermentation).\n"
              "Respiration is roughly the reverse of photosynthesis."},
    {"words": ["cell", "cells", "cell structure", "organelle", "organelles", "nucleus", "cell membrane", "cell wall"],
     "notes": "The cell is the basic unit of life. Main parts:\n"
              "• Cell membrane – controls what enters and leaves\n"
              "• Nucleus – contains DNA, controls the cell\n"
              "• Cytoplasm – jelly where reactions happen\n"
              "• Mitochondria – release energy (respiration)\n"
              "• Ribosomes – make proteins\n"
              "Plant cells also have a cell wall (support), chloroplasts (photosynthesis) and a large vacuole."},
    {"words": ["dna", "genetics", "gene", "genes", "chromosome", "chromosomes", "mitosis", "meiosis"],
     "notes": "• DNA carries genetic information; it's a double helix made of nucleotides (bases A–T, C–G pair up).\n"
              "• A gene is a section of DNA that codes for a characteristic. Genes are on chromosomes (humans have 46, in 23 pairs).\n"
              "• Mitosis: one cell → 2 identical cells (growth and repair).\n"
              "• Meiosis: one cell → 4 sex cells with half the chromosomes (for reproduction, causes variation)."},

    # ---- Physical Sciences ----
    {"words": ["newton", "newton's laws", "newtons laws", "force", "forces", "inertia", "f=ma"],
     "notes": "Newton's laws of motion:\n"
              "1. An object stays at rest or keeps moving at constant velocity unless a resultant force acts on it (inertia).\n"
              "2. Resultant force = mass × acceleration: F = ma (F in newtons, m in kg, a in m/s²).\n"
              "3. When A pushes on B, B pushes back on A with an equal force in the opposite direction.\n"
              "Example: F = 2 kg × 3 m/s² = 6 N."},
    {"words": ["states of matter", "solid", "liquid", "gas", "melting", "evaporation", "condensation", "particles"],
     "notes": "Matter is made of particles that are always moving.\n"
              "• Solid – particles tightly packed, vibrate in place; fixed shape and volume.\n"
              "• Liquid – close but can slide past each other; fixed volume, takes the container's shape.\n"
              "• Gas – far apart, move fast; fills any container.\n"
              "Changes: melting (s→l), freezing (l→s), evaporation/boiling (l→g), condensation (g→l), sublimation (s→g)."},
    {"words": ["atom", "atoms", "proton", "neutron", "electron", "periodic table", "element", "elements"],
     "notes": "An atom has a nucleus (protons +, neutrons no charge) with electrons (−) around it.\n"
              "• Atomic number = number of protons (this decides the element).\n"
              "• Mass number = protons + neutrons.\n"
              "• A neutral atom has as many electrons as protons.\n"
              "• The periodic table orders elements by atomic number; elements in the same group (column) react similarly."},
    {"words": ["electricity", "current", "voltage", "resistance", "ohm", "ohm's law", "circuit"],
     "notes": "• Current (I, amperes) – the flow of charge.\n"
              "• Potential difference / voltage (V, volts) – the energy pushing the charge.\n"
              "• Resistance (R, ohms Ω) – how much a component opposes the current.\n"
              "Ohm's law: V = I × R. Example: 2 A through 5 Ω → V = 10 V.\n"
              "Series: same current everywhere, resistances add. Parallel: same voltage across each branch."},
    {"words": ["water cycle", "evaporation and condensation", "precipitation"],
     "notes": "The water cycle: the sun heats water → evaporation (water becomes vapour) → the vapour rises and cools → "
              "condensation (clouds form) → precipitation (rain, hail, snow) → collection in rivers, dams and the sea, "
              "and the cycle repeats. Plants also add water vapour through transpiration."},

    # ---- study skills ----
    {"words": ["study", "studying", "how to study", "study tips", "exam", "exams", "revise", "revision", "memorise"],
     "notes": "Study tips that work:\n"
              "• Short sessions: 25–30 minutes, then a 5-minute break.\n"
              "• Test yourself instead of rereading: cover your notes and say or write what you remember. "
              "The quizzes in Smart Learning are good for this.\n"
              "• Space it out: review a topic after a day, then after a week.\n"
              "• Practise old question papers under exam time (see the Papers tab).\n"
              "• Mix topics, explain them to someone else, and sleep well before the exam."},
]


def best_topic(text: str):
    """The topic whose words best match `text` (longer phrases count more), or None."""
    import re
    best, best_score = None, 0
    for topic in TOPICS:
        score = 0
        for w in topic["words"]:
            if re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", text):
                score += len(w.split()) * 2 + len(w) / 20
        if score > best_score:
            best, best_score = topic, score
    return best
