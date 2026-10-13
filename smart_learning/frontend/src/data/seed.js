// Demo data ported from the prototype. Everything lives in memory until the backend is wired up.

export const ROLES = ['learner','teacher','parent','hod','principal','admin'];

export const GRADES = ['10','11','12'];

// every subject offered in Grades 10–12 (FET phase, CAPS), grouped by learning area.
// subject_1/2/3 are Mathematics/English/Life Sciences (the keys the demo data uses).
export const SUBJECT_GROUPS = [
  { id:'languages', labelKey:'subject_group_languages', subjects:[
    'subject_2','subject_afrikaans','subject_isizulu','subject_isixhosa','subject_isindebele','subject_sepedi',
    'subject_sesotho','subject_setswana','subject_siswati','subject_tshivenda','subject_xitsonga','subject_sasl','subject_lo',
  ] },
  { id:'mathematics', labelKey:'subject_group_compulsory', subjects:['subject_1','subject_math_lit','subject_tech_math'] },
  { id:'science', labelKey:'subject_group_sciences', subjects:[
    'subject_physical_sciences','subject_3','subject_tech_sciences','subject_agri_sciences',
    'subject_agri_technology','subject_agri_management','subject_marine_sciences','subject_sport_science',
  ] },
  { id:'commerce', labelKey:'subject_group_commerce', subjects:['subject_accounting','subject_business','subject_economics'] },
  { id:'humanities', labelKey:'subject_group_humanities', subjects:['subject_geography','subject_history','subject_religion'] },
  { id:'technology', labelKey:'subject_group_technology', subjects:[
    'subject_cat','subject_it','subject_egd','subject_civil_tech','subject_electrical_tech',
    'subject_mechanical_tech','subject_maritime_economics','subject_nautical_science',
  ] },
  { id:'services', labelKey:'subject_group_services', subjects:['subject_consumer','subject_hospitality','subject_tourism'] },
  { id:'arts', labelKey:'subject_group_arts', subjects:['subject_dance','subject_design','subject_drama','subject_music','subject_visual_arts'] },
];

export const SUBJECT_OPTIONS = SUBJECT_GROUPS.flatMap(g=>g.subjects);

export const LANGUAGES = [
  ['English','English'], ['Afrikaans','Afrikaans'], ['Zulu','isiZulu'], ['Xhosa','isiXhosa'],
  ['Ndebele','isiNdebele'], ['Sepedi','Sepedi'], ['Sesotho','Sesotho'], ['Setswana','Setswana'],
  ['Swati','siSwati'], ['Tshivenda','Tshivenda'], ['Xitsonga','Xitsonga'],
].map(([value,label])=>({ value, label }));

export const QUIZ_BANK = [
  { qKey:'quiz_q1', optKeys:['quiz_q1_a','quiz_q1_b','quiz_q1_c','quiz_q1_d'], correct:0 },
  { qKey:'quiz_q2', optKeys:['quiz_q2_a','quiz_q2_b','quiz_q2_c','quiz_q2_d'], correct:0 },
  { qKey:'quiz_q3', optKeys:['quiz_q3_a','quiz_q3_b','quiz_q3_c','quiz_q3_d'], correct:0 },
  { qKey:'quiz_q4', optKeys:['quiz_q4_a','quiz_q4_b','quiz_q4_c','quiz_q4_d'], correct:0 },
  { qKey:'quiz_q5', optKeys:['quiz_q5_a','quiz_q5_b','quiz_q5_c','quiz_q5_d'], correct:0 },
];

// the departments an HOD can lead: one per subject group above
export const DEPARTMENTS = SUBJECT_GROUPS.map(g=>({ id:g.id, labelKey:g.labelKey }));

// subjects offered in the sign-up form's subject dropdown (shown for the
// Teacher role, so a teacher account records what they teach)

export const ASSESSMENTS_BANK = {
  '10': [
    { subjectKey:'subject_1', titleKey:'assess_g10_math_title', descKey:'assess_g10_math_desc', due:'22 Sep' },
    { subjectKey:'subject_2', titleKey:'assess_g10_eng_title', descKey:'assess_g10_eng_desc', due:'18 Sep' },
    { subjectKey:'subject_3', titleKey:'assess_g10_ls_title', descKey:'assess_g10_ls_desc', due:'29 Sep' },
  ],
  '11': [
    { subjectKey:'subject_1', titleKey:'assess_g11_math_title', descKey:'assess_g11_math_desc', due:'23 Sep' },
    { subjectKey:'subject_2', titleKey:'assess_g11_eng_title', descKey:'assess_g11_eng_desc', due:'19 Sep' },
    { subjectKey:'subject_3', titleKey:'assess_g11_ls_title', descKey:'assess_g11_ls_desc', due:'30 Sep' },
  ],
  '12': [
    { subjectKey:'subject_1', titleKey:'assess_g12_math_title', descKey:'assess_g12_math_desc', due:'24 Sep' },
    { subjectKey:'subject_2', titleKey:'assess_g12_eng_title', descKey:'assess_g12_eng_desc', due:'20 Sep' },
    { subjectKey:'subject_3', titleKey:'assess_g12_ls_title', descKey:'assess_g12_ls_desc', due:'1 Oct' },
  ],
};

export function createInitialState(){
  return {
    auth: { loggedIn:false, name:'', role:'learner', grade:'10' },
    role: 'learner',
    learner: {
      teacherName:'Mrs. Dlamini',
      lessons: [
        { id:1, key:'lesson_1', progress:100, done:true, assessmentViewed:true },
        { id:2, key:'lesson_2', progress:60, done:false, assessmentViewed:false },
        { id:3, key:'lesson_3', progress:0, done:false, assessmentViewed:false },
      ],
      recommendation: null,
      rating: 0,
      quiz: { started:false, submitted:false, index:0, answers:[], score:null, feedback:null },
      expandedAssessment: null,
      quizAttempts: {}, // teacherQuizId -> { index, answers, submitted, score }
      activeQuizId: null,
      quizSubjectFilter: 'all', // 'all' or a subjectKey — narrows the quiz list to one subject
      tab: 'overview', // 'overview' | 'quizzes' | 'rate'
    },
    teacher: {
      tab: 'class', // 'class' | 'quiz' | 'papers'
      classFilter: 'all', // 'all' or the id of one of the teacher's classes
      suggestion: {},
      quizzes: [
        // one quiz per core subject (Mathematics, English, Life Sciences) and grade, each set
        // by that class's teacher, so a learner has a quiz of each subject to take
        { id:1, teacherId:3, classIds:[1,2], title:'Quick Practice Quiz', grade:'10', subjectKey:'subject_1', timeLimitMin:3, questions:[
          { text:'What is 7 + 5?', answer:'12' },
          { text:'What is 9 x 3?', answer:'27' },
          { text:'What is the capital city of South Africa’s executive branch (Union Buildings)?', answer:'Pretoria' },
        ] },
        { id:2, teacherId:3, classIds:[3], title:'Functions & Graphs Quiz', grade:'11', subjectKey:'subject_1', timeLimitMin:3, questions:[
          { text:'What is the gradient of y = 2x + 3?', answer:'2' },
          { text:'Solve for x: 3x = 15', answer:'5' },
        ] },
        { id:4, teacherId:4, classIds:[4], title:'Grammar & Vocabulary Quiz', grade:'10', subjectKey:'subject_2', timeLimitMin:3, questions:[
          { text:'What is the past tense of "go"?', answer:'went' },
          { text:'Identify the noun: The dog barked loudly.', answer:'dog' },
        ] },
        { id:5, teacherId:4, classIds:[5], title:'Comprehension Quiz', grade:'11', subjectKey:'subject_2', timeLimitMin:3, questions:[
          { text:'What is a synonym for "happy"?', answer:'joyful' },
          { text:'What is the plural of "child"?', answer:'children' },
        ] },
        { id:7, teacherId:10, classIds:[6], title:'Cell Biology Quiz', grade:'10', subjectKey:'subject_3', timeLimitMin:3, questions:[
          { text:'What is the basic unit of life?', answer:'cell' },
          { text:'Which organelle produces energy in a cell?', answer:'mitochondria' },
        ] },
        { id:8, teacherId:10, classIds:[7], title:'Human Systems Quiz', grade:'11', subjectKey:'subject_3', timeLimitMin:3, questions:[
          { text:'Which organ pumps blood around the body?', answer:'heart' },
          { text:'What gas do plants release during photosynthesis?', answer:'oxygen' },
        ] },
      ], // teacher-authored quizzes: { id, teacherId, classIds, title, grade, subjectKey, timeLimitMin, questions:[{text,answer}] }
      quizDraft: { title:'', classIds:[], timeLimitMin:0, questions:[{text:'', answer:''}] },
      nextQuizId: 10,
      quizResults: {
        1: [
          { learnerId:1, learner:'Thabo Mokoena', score:3, total:3 },
          { learnerId:9, learner:'Sipho Ndlovu', score:2, total:3 },
        ],
        2: [
          { learnerId:2, learner:'Lindiwe Khoza', score:1, total:2 },
        ],
      }, // quizId -> [{ learnerId, learner, score, total }]
      showResultsFor: null,
      papers: [], // question papers: { id, teacherId, classIds, title, grade, subjectKey, fileName, fileUrl }
      paperDraft: { title:'', classIds:[], fileName:null, fileUrl:null },
      nextPaperId: 1,
      ocrGeneratingId: null, // id of the paper currently being read by AI, or null
      ocrErrorId: null, ocrErrorCode: null, // id + code of the paper whose last AI attempt failed
    },
    parent: {
      selectedChildId: null, // which linked learner the parent is viewing (null = the first one)
      notifications: [
        { key:'notif_1', timeKey:'time_1', read:false },
        { key:'notif_2', timeKey:'time_2', read:false },
        { key:'notif_3', timeKey:'time_3', read:true },
      ],
    },
    principal: {
      teachers: [
        { id:1, name:'Mrs. Dlamini', subjectKey:'subject_1', dept:'mathematics', gradeKey:'grade_10', workDone:null, ratings:[5,4,5,3,4,5,2,4], attendance:96, performance:71, feedback:'', feedbackSent:false },
        { id:4, name:'Mr. Nkosi', subjectKey:'subject_1', dept:'mathematics', gradeKey:'grade_12', workDone:true, ratings:[5,5,4,5,5,4], attendance:92, performance:74, feedback:'', feedbackSent:false },
        { id:2, name:'Mr. Khumalo', subjectKey:'subject_2', dept:'languages', gradeKey:'grade_11', workDone:true, ratings:[4,4,3,5,4,4], attendance:91, performance:78, feedback:'', feedbackSent:false },
        { id:5, name:'Ms. van Wyk', subjectKey:'subject_afrikaans', dept:'languages', gradeKey:'grade_10', workDone:null, ratings:[4,3,4,4,5], attendance:89, performance:73, feedback:'', feedbackSent:false },
        { id:7, name:'Ms. Mokoena', subjectKey:'subject_lo', dept:'languages', gradeKey:'grade_11', workDone:false, ratings:[4,5,4,3,4], attendance:85, performance:69, feedback:'', feedbackSent:false },
        { id:3, name:'Ms. Naidoo', subjectKey:'subject_3', dept:'science', gradeKey:'grade_12', workDone:false, ratings:[5,5,4,5,3,4,4], attendance:88, performance:65, feedback:'', feedbackSent:false },
        { id:6, name:'Mr. Zulu', subjectKey:'subject_3', dept:'science', gradeKey:'grade_11', workDone:true, ratings:[5,4,5,5,4,5,3], attendance:93, performance:70, feedback:'', feedbackSent:false },
      ],
      selectedTeacherId: 1,
      showTeacherList: false,
      reports: [], // HOD-submitted department reports: { id, dept, sentAt, rows:[{name,subjectKey,gradeKey,attendance,performance,avgRating}] }
    },
    hod: {
      dept: 'mathematics',
      suggestion: {}, // teacherId -> suggestion text
      lastReportSentAt: null,
    },
    admin: {
      rows: [
        { key:'subject_1', attendance:94, performance:71 },
        { key:'subject_2', attendance:91, performance:78 },
        { key:'subject_3', attendance:88, performance:65 },
      ],
      // accounts: nobody signs up; the school administrator creates every account here
      // (demo password: Demo@1234). A parent only sees the learners in their childIds,
      // which the administrator links. A learner's status and note show on their teachers' class lists.
      users: [
        { id:1, name:'Thabo Mokoena', email:'thabo@school.demo', role:'learner', grade:'10', progress:78, status:'on_track', noteKey:'learner1_note', password:'Demo@1234', mustChangePassword:false },
        { id:2, name:'Lindiwe Khoza', email:'lindiwe@school.demo', role:'learner', grade:'11', progress:64, status:'at_risk', noteKey:'learner2_note', password:'Demo@1234', mustChangePassword:false },
        { id:9, name:'Sipho Ndlovu', email:'sipho@school.demo', role:'learner', grade:'10', progress:55, status:'watch', noteKey:'learner3_note', password:'Demo@1234', mustChangePassword:false },
        { id:3, name:'Mrs. Dlamini', email:'dlamini@school.demo', role:'teacher', subjectKey:'subject_1', password:'Demo@1234', mustChangePassword:false },
        { id:4, name:'Mr. Khumalo', email:'khumalo@school.demo', role:'teacher', subjectKey:'subject_2', password:'Demo@1234', mustChangePassword:false },
        { id:10, name:'Ms. Naidoo', email:'naidoo@school.demo', role:'teacher', subjectKey:'subject_3', password:'Demo@1234', mustChangePassword:false },
        { id:5, name:'Nomsa Mokoena', email:'nomsa@school.demo', role:'parent', childIds:[1], password:'Demo@1234', mustChangePassword:false },
        { id:6, name:'Mrs. Dlamini', email:'dlamini.hod@school.demo', role:'hod', dept:'mathematics', password:'Demo@1234', mustChangePassword:false },
        { id:7, name:'Mr. Sithole', email:'sithole@school.demo', role:'principal', password:'Demo@1234', mustChangePassword:false },
        { id:8, name:'Ms. Pillay', email:'pillay@school.demo', role:'admin', password:'Demo@1234', mustChangePassword:false },
      ],
      nextUserId: 11,
      // classes (subject groups): one subject taught by one teacher to a group of learners.
      // Mrs. Dlamini teaches three Mathematics classes; each teacher sees only their own.
      classes: [
        { id:1, name:'10A', grade:'10', subjectKey:'subject_1', teacherId:3, learnerIds:[1] },
        { id:2, name:'10B', grade:'10', subjectKey:'subject_1', teacherId:3, learnerIds:[9] },
        { id:3, name:'11A', grade:'11', subjectKey:'subject_1', teacherId:3, learnerIds:[2] },
        { id:4, name:'10A', grade:'10', subjectKey:'subject_2', teacherId:4, learnerIds:[1,9] },
        { id:5, name:'11A', grade:'11', subjectKey:'subject_2', teacherId:4, learnerIds:[2] },
        { id:6, name:'10A', grade:'10', subjectKey:'subject_3', teacherId:10, learnerIds:[1,9] },
        { id:7, name:'11A', grade:'11', subjectKey:'subject_3', teacherId:10, learnerIds:[2] },
      ],
      nextClassId: 8,
      newClass: { name:'', grade:'10', subjectKey:'subject_1', teacherId:'' },
      classError: null,
      newUser: { name:'', email:'', role:'teacher', grade:'10', idNumber:'', subjectKey:'subject_1', dept:'mathematics', childId:'' },
      lastInvite: null, // { name, email, role, tempPassword } shown after adding a user or resending a login
      userFilter: 'all',
      tab: 'overview', // 'overview' | 'users' | 'add'
    },
    nextReportId: 1,
  };
}
