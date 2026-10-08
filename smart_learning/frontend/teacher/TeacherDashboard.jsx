import { useStore } from '../src/store/AppStore.jsx'
import { SectionNav } from '../src/components/ui.jsx'
import ClassCard from './ClassCard.jsx'
import QuizBuilderCard from './QuizBuilderCard.jsx'
import QuizListCard from './QuizListCard.jsx'
import PapersManager from './PapersManager.jsx'

export default function TeacherDashboard(){
  const { state, update } = useStore();
  const s = state.teacher;
  const tabs = [
    { id:'class', icon:'cap', labelKey:'nav_my_class' },
    { id:'quiz', icon:'edit', labelKey:'nav_set_quiz', count:s.quizzes.length },
    { id:'papers', icon:'paperclip', labelKey:'nav_papers', count:s.papers.length },
  ];

  return (
    <div className="card-teacher role-scope">
      <SectionNav tabs={tabs} active={s.tab} onSelect={(id)=>update(st=>{ st.teacher.tab = id; })}/>
      {s.tab==='class' && <ClassCard/>}
      {s.tab==='quiz' && <QuizBuilderCard/>}
      {s.tab==='quiz' && <QuizListCard/>}
      {s.tab==='papers' && <PapersManager/>}
    </div>
  );
}
