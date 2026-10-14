import { useStore } from '../src/store/AppStore.jsx'
import { SectionNav } from '../src/components/ui.jsx'
import { forLearner } from '../src/services/classes.js'
import { isTeacherQuizActive } from './quizState.js'
import LessonsCard from './LessonsCard.jsx'
import TeacherQuizzesCard from './TeacherQuizzesCard.jsx'
import CheckinQuizCard from './CheckinQuizCard.jsx'
import PapersCard from './PapersCard.jsx'
import RateTeacherCard from './RateTeacherCard.jsx'
import OnlineClassesCard from './OnlineClassesCard.jsx'

export default function LearnerDashboard(){
  const { state, update } = useStore();
  const s = state.learner;
  const me = state.auth.userId;
  const tabs = [
    { id:'overview', icon:'book', labelKey:'nav_overview' },
    { id:'quizzes', icon:'help', labelKey:'nav_quizzes' },
    { id:'papers', icon:'paperclip', labelKey:'nav_papers', count:forLearner(state, state.teacher.papers, me).length },
    { id:'online', icon:'users', labelKey:'nav_online_classes' },
    { id:'rate', icon:'star', labelKey:'nav_rate_teacher' },
  ];

  return (
    <div className="card-learner role-scope">
      <SectionNav tabs={tabs} active={s.tab} onSelect={(id)=>update(st=>{ st.learner.tab = id; })}/>
      {s.tab==='overview' && <LessonsCard/>}
      {s.tab==='quizzes' && <TeacherQuizzesCard/>}
      {/* while a teacher's quiz is in progress the check-in quiz is hidden entirely */}
      {s.tab==='quizzes' && !isTeacherQuizActive(s) && <CheckinQuizCard/>}
      {s.tab==='papers' && <PapersCard/>}
      {s.tab==='online' && <OnlineClassesCard/>}
      {s.tab==='rate' && <RateTeacherCard/>}
    </div>
  );
}
