import { useStore } from '../src/store/AppStore.jsx'
import { SectionNav } from '../src/components/ui.jsx'
import ClassCard from './ClassCard.jsx'
import QuizTab from './QuizTab.jsx'
import PapersManager from './PapersManager.jsx'
import OnlineClassesCard from './OnlineClassesCard.jsx'

export default function TeacherDashboard(){
  const { state, update } = useStore();
  const s = state.teacher;
  const tabs = [
    { id:'class', icon:'cap', labelKey:'nav_my_class' },
    { id:'quiz', icon:'edit', labelKey:'nav_set_quiz' },
    { id:'papers', icon:'paperclip', labelKey:'nav_papers' },
    { id:'online', icon:'users', labelKey:'nav_online_classes' },
  ];

  return (
    <div className="card-teacher role-scope">
      <SectionNav tabs={tabs} active={s.tab} onSelect={(id)=>update(st=>{ st.teacher.tab = id; })}/>
      {s.tab==='class' && <ClassCard/>}
      {s.tab==='quiz' && <QuizTab/>}
      {s.tab==='papers' && <PapersManager/>}
      {s.tab==='online' && <OnlineClassesCard/>}
    </div>
  );
}
