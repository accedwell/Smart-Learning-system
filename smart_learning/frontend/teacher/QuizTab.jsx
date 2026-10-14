import { useEffect, useState } from 'react'
import { useStore } from '../src/store/AppStore.jsx'
import { useI18n } from '../src/i18n/I18nContext.jsx'
import { apiGet, errorText } from '../src/services/api.js'
import QuizBuilderCard from './QuizBuilderCard.jsx'
import QuizListCard from './QuizListCard.jsx'

// The teacher's "Set a Quiz" tab: the test builder and the tests already set, both on the
// backend, so learners in other places get them and their marks come back here.
export default function QuizTab(){
  const { state } = useStore();
  const { t } = useI18n();
  const token = state.auth.token;
  const [classes, setClasses] = useState([]);
  const [quizzes, setQuizzes] = useState(null); // null while loading
  const [error, setError] = useState(null);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([apiGet('/teacher/class', token), apiGet('/teacher/quizzes', token)]).then(([cr, qr])=>{
      if(cancelled) return;
      const failed = cr.error || qr.error;
      if(failed){ setError(errorText(t, failed)); setQuizzes([]); return; }
      setClasses(cr.data.classes);
      setQuizzes(qr.data.quizzes);
    });
    return ()=>{ cancelled = true; };
  }, [token, t]);

  return (
    <>
      {error && <div className="card card-teacher"><p className="field-error">{error}</p></div>}
      <QuizBuilderCard classes={classes} onPublished={(quiz)=>setQuizzes(list=>[...(list||[]), { ...quiz, resultCount:0 }])}/>
      <QuizListCard classes={classes} quizzes={quizzes} onDeleted={(id)=>setQuizzes(list=>list.filter(q=>q.id!==id))}/>
    </>
  );
}
