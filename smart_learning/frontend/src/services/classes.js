// Classes are subject groups: one subject taught by one teacher to a group of learners,
// e.g. 10A Mathematics. The administrator sets them up (state.admin.classes). A teacher
// sees only their own classes, and a learner gets only their classes' quizzes and papers.

import { CLASS_LETTERS } from '../data/seed.js'

// "10A", "10B", "10C": a grade's register classes (each learner is in one)
export function registerClasses(grade){
  return grade ? CLASS_LETTERS.map(letter=>grade+letter) : [];
}

// "10A Mathematics"
export function classLabel(c, t){
  return c.name+' '+t(c.subjectKey);
}

export function classesOfTeacher(state, teacherId){
  return state.admin.classes.filter(c=>c.teacherId===teacherId);
}

export function classesOfLearner(state, learnerId){
  return state.admin.classes.filter(c=>c.learnerIds.includes(learnerId));
}

// the quizzes or papers sent to any of the learner's classes
export function forLearner(state, items, learnerId){
  const mine = classesOfLearner(state, learnerId).map(c=>c.id);
  return items.filter(item=>item.classIds.some(id=>mine.includes(id)));
}

// "10A, 10B" for the classes a quiz or paper was sent to
export function classNames(state, classIds){
  return state.admin.classes.filter(c=>classIds.includes(c.id)).map(c=>c.name).join(', ');
}
