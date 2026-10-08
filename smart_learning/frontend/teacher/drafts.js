export function makeEmptyQuizDraft(grade, subjectKey='subject_1'){
  return { title:'', grade:grade||'10', subjectKey, timeLimitMin:0, questions:[{ text:'', answer:'' }] };
}

export function makeEmptyPaperDraft(grade, subjectKey='subject_1'){
  return { title:'', grade:grade||'10', subjectKey, fileName:null, fileUrl:null };
}
