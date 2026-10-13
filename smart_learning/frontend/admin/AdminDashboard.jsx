import { useStore } from '../src/store/AppStore.jsx'
import { SectionNav } from '../src/components/ui.jsx'
import AdminOverview from './AdminOverview.jsx'
import UserListCard from './UserListCard.jsx'
import AddUserCard from './AddUserCard.jsx'
import ClassesCard from './ClassesCard.jsx'

export default function AdminDashboard(){
  const { state, update } = useStore();
  const s = state.admin;
  const setTab = (id)=>update(st=>{ st.admin.tab = id; });
  const tabs = [
    { id:'overview', icon:'building', labelKey:'nav_overview' },
    { id:'users', icon:'users', labelKey:'nav_users', count:s.users.length },
    { id:'add', icon:'edit', labelKey:'nav_add_user' },
    { id:'classes', icon:'cap', labelKey:'nav_classes', count:s.classes.length },
  ];

  return (
    <div className="card-admin role-scope">
      <SectionNav tabs={tabs} active={s.tab} onSelect={setTab}/>
      {s.tab==='overview' && <AdminOverview onOpenUsers={()=>setTab('users')}/>}
      {s.tab==='users' && <UserListCard/>}
      {s.tab==='add' && <AddUserCard/>}
      {s.tab==='classes' && <ClassesCard/>}
    </div>
  );
}
