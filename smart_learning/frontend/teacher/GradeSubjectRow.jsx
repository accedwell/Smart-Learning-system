import { useI18n } from '../src/i18n/I18nContext.jsx'
import { GradeSelect, SubjectSelect } from '../src/components/ui.jsx'

// grade + subject pickers shared by the quiz builder and the paper uploader
export default function GradeSubjectRow({ grade, subjectKey, onGrade, onSubject }){
  const { t } = useI18n();
  return (
    <div className="grid grid-2" style={{ marginTop:10 }}>
      <div className="field">
        <label>{t('teacher_quiz_grade_label')}</label>
        <GradeSelect value={grade} onChange={onGrade}/>
      </div>
      <div className="field">
        <label>{t('teacher_quiz_subject_label')}</label>
        <SubjectSelect value={subjectKey} onChange={onSubject}/>
      </div>
    </div>
  );
}
