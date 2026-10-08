// A learner may only have one quiz in progress at a time: either the built-in
// check-in quiz or one of the teacher's quizzes, never both.
export function isCheckinQuizActive(learner){
  return learner.quiz.started && !learner.quiz.submitted;
}

export function isTeacherQuizActive(learner){
  const id = learner.activeQuizId;
  if(id==null) return false;
  const attempt = learner.quizAttempts[id];
  return !attempt || !attempt.submitted;
}

export function newAttempt(quiz){
  return { index:0, answers:[], submitted:false, score:null, timedOut:false,
    deadline: quiz.timeLimitMin ? Date.now() + quiz.timeLimitMin*60000 : null };
}

export function formatQuizTime(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds));
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}

// marks the attempt (case-insensitive exact match) and records it on the teacher's results
export function submitAttempt(state, quiz, timedOut){
  const attempt = state.learner.quizAttempts[quiz.id];
  if(!attempt || attempt.submitted) return;
  let score = 0;
  quiz.questions.forEach((q,i)=>{
    const given = (attempt.answers[i]||'').trim().toLowerCase();
    if(given && given===(q.answer||'').trim().toLowerCase()) score++;
  });
  attempt.score = score;
  attempt.submitted = true;
  attempt.timedOut = timedOut;

  // learnerId ties the mark to the learner's account, so only their linked parent sees it
  const learnerId = state.auth.userId ?? null;
  const learnerName = (state.auth.name||'').trim() || 'Learner';
  const list = state.teacher.quizResults[quiz.id] || (state.teacher.quizResults[quiz.id] = []);
  const existing = list.find(r=>learnerId!=null ? r.learnerId===learnerId : r.learner===learnerName);
  if(existing){ existing.score = score; existing.total = quiz.questions.length; }
  else list.push({ learnerId, learner:learnerName, score, total:quiz.questions.length });
}

// "Thabo Mokoena" -> "Thabo M.", the way learners are listed on the teacher's class dashboard
export function shortName(fullName){
  const parts = (fullName||'').trim().split(/\s+/);
  return parts.length>1 ? parts[0]+' '+parts[parts.length-1][0]+'.' : parts[0]||'';
}
