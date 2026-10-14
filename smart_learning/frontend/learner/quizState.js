// A learner may only have one quiz in progress at a time: either the built-in
// check-in quiz or one of the teacher's tests, never both.
export function isCheckinQuizActive(learner){
  return learner.quiz.started && !learner.quiz.submitted;
}

// set by QuizTaking: activeQuizId while a teacher's test is open, activeQuizRunning while its
// attempt is not submitted yet
export function isTeacherQuizActive(learner){
  return learner.activeQuizId!=null && Boolean(learner.activeQuizRunning);
}

export function formatQuizTime(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds));
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}

// "Thabo Mokoena" -> "Thabo M.", the way learners are listed on the teacher's class dashboard
export function shortName(fullName){
  const parts = (fullName||'').trim().split(/\s+/);
  return parts.length>1 ? parts[0]+' '+parts[parts.length-1][0]+'.' : parts[0]||'';
}
