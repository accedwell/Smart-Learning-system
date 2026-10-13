import { useI18n } from '../src/i18n/I18nContext.jsx'
import { classLabel } from '../src/services/classes.js'

// which of the teacher's own classes a quiz or paper goes to, shared by the quiz builder
// and the paper uploader. One item is for one grade and subject, so once a class is
// picked, classes of another grade or subject can't be added to it.
export default function ClassPicker({ classes, value, onChange }){
  const { t } = useI18n();
  const first = classes.find(c=>value.includes(c.id));
  return (
    <div className="field" style={{ marginTop:10 }}>
      <label>{t('teacher_classes_label')}</label>
      {classes.length===0 && <p className="muted" style={{ margin:0 }}>{t('teacher_no_classes')}</p>}
      <div className="class-picker">
        {classes.map(c=>{
          const checked = value.includes(c.id);
          const disabled = !checked && Boolean(first) && (c.grade!==first.grade || c.subjectKey!==first.subjectKey);
          return (
            <label key={c.id} className={'class-option'+(checked?' checked':'')+(disabled?' disabled':'')}>
              <input type="checkbox" checked={checked} disabled={disabled}
                onChange={()=>onChange(checked ? value.filter(id=>id!==c.id) : [...value, c.id])}/>
              {classLabel(c, t)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
