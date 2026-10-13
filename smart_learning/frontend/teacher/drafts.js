// a quiz or paper goes to one or more of the teacher's classes (all the same grade and subject)
export function makeEmptyQuizDraft(classIds=[]){
  return { title:'', classIds, timeLimitMin:0, questions:[{ text:'', answer:'' }] };
}

export function makeEmptyPaperDraft(classIds=[]){
  return { title:'', classIds, fileName:null, fileUrl:null };
}
