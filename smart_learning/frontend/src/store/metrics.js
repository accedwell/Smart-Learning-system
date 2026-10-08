export function teacherAvg(teacher){
  return teacher.ratings.reduce((a,b)=>a+b,0)/teacher.ratings.length;
}

export function scoreClass(pct){
  return pct>=0.8 ? 'good' : (pct>=0.5 ? 'warn' : 'bad');
}
