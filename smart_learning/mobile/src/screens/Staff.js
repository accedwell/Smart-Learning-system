// The HOD's and the principal's apps: teachers' attendance, performance and ratings, whether
// their interventions are done, feedback, and the departments' reports.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { apiPatch, apiPost, errorText } from '../api';
import {
  Avatar, Bar, Button, Card, Chips, Empty, ErrorText, Field, Grid2, Loaded, Note, Pill, Row, Screen, Stat,
  formatTime, initials, useData, useKit,
} from '../ui';
import { HeaderButtons } from './Common';

const teaching = (t, tc) => [tc.gradeKey && t(tc.gradeKey), tc.subjectKey && t(tc.subjectKey)].filter(Boolean).join(' · ');
const avg = (r) => (r.average == null ? '–' : Number(r.average).toFixed(1));

function useDeptLabel() {
  const { t } = useKit();
  const catalog = useData('/catalog');
  return (id) => {
    const dep = catalog.data && catalog.data.departments.find((d) => d.id === id);
    return dep ? t(dep.labelKey) : id || '';
  };
}

function WorkDone({ teacher, onSet, busy }) {
  const { t, c } = useKit();
  if (teacher.workDone === true) return <Pill kind="good" text={t('principal_work_done_pill')} />;
  return (
    <View style={{ gap: 8 }}>
      {teacher.workDone === false ? <Pill kind="bad" text={t('principal_reminder_pill')} /> : <Text style={{ color: c.inkSoft, fontSize: 13 }}>{t('principal_ask')}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {teacher.workDone === null ? <Button small title={t('principal_not_yet')} onPress={() => onSet(false)} busy={busy} /> : null}
        <Button small kind="primary" title={t('principal_yes')} onPress={() => onSet(true)} busy={busy} />
      </View>
    </View>
  );
}

function Ratings({ ratings }) {
  const { t, c } = useKit();
  const most = Math.max(1, ...ratings.distribution.map((d) => d.count));
  return (
    <View>
      <Text style={{ color: c.ink, fontSize: 26, fontWeight: '800' }}>{avg(ratings)} / 5</Text>
      <Text style={{ color: c.inkSoft, fontSize: 12.5, marginBottom: 6 }}>{t('principal_ratings_caption', { n: ratings.count })}</Text>
      {ratings.distribution.map((d) => (
        <View key={d.stars} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
          <Text style={{ color: c.inkSoft, width: 28, fontSize: 12.5 }}>{d.stars}★</Text>
          <View style={{ flex: 1 }}><Bar pct={(d.count / most) * 100} color={c.brand} /></View>
          <Text style={{ color: c.inkSoft, width: 22, textAlign: 'right', fontSize: 12.5 }}>{d.count}</Text>
        </View>
      ))}
    </View>
  );
}

// ---- HOD ----

export function HodDepartment() {
  const { t, has, token, lang, c, showToast } = useKit();
  const state = useData('/hod/teachers');
  const deptLabel = useDeptLabel();
  const [busy, setBusy] = useState(null);
  const [tips, setTips] = useState({});

  async function setWork(tc, workDone) {
    setBusy(tc.id);
    const { error } = await apiPatch(`/hod/teachers/${tc.id}/work-done`, { workDone }, token);
    setBusy(null);
    if (error) return showToast(errorText(t, has, error));
    state.reload();
  }
  async function suggest(tc) {
    setTips((s) => ({ ...s, [tc.id]: t('learner_ai_thinking') }));
    const { data, error } = await apiPost(`/hod/teachers/${tc.id}/suggestion`, { lang }, token);
    setTips((s) => ({ ...s, [tc.id]: error ? errorText(t, has, error) : data.suggestion }));
  }
  async function sendReport() {
    setBusy('report');
    const { error } = await apiPost('/hod/reports', {}, token);
    setBusy(null);
    showToast(error ? errorText(t, has, error) : t('hod_report_sent_note'));
  }

  return (
    <Screen title={t('hod_dept_title')} sub={state.data ? deptLabel(state.data.dept) : null} right={<HeaderButtons />}
      onRefresh={state.reload} refreshing={state.loading}>
      <Loaded state={state}>
        {(data) => data.teachers.length === 0 ? <Note>{t('hod_teachers_empty')}</Note> : data.teachers.map((tc) => (
          <Card key={tc.id}>
            <Row first left={<Avatar text={initials(tc.name)} color={c.brand} />} title={tc.name} meta={teaching(t, tc)}
              right={<Text style={{ color: c.ink, fontWeight: '700' }}>★ {tc.ratings.average == null ? t('hod_no_ratings') : avg(tc.ratings)}</Text>} />
            <Grid2>
              <Stat n={tc.attendance == null ? '–' : tc.attendance + '%'} label={t('hod_report_col_attendance')} />
              <Stat n={tc.performance == null ? '–' : tc.performance + '%'} label={t('hod_report_col_performance')} />
            </Grid2>
            <WorkDone teacher={tc} busy={busy === tc.id} onSet={(v) => setWork(tc, v)} />
            <Button small title={t('hod_suggest_btn')} onPress={() => suggest(tc)} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
            {tips[tc.id] ? <Note><Text style={{ color: c.ink }}><Text style={{ fontWeight: '700' }}>{t('hod_ai_prefix')}</Text>{tips[tc.id]}</Text></Note> : null}
          </Card>
        ))}
      </Loaded>
      <Card title={t('hod_report_title')}>
        <Text style={{ color: c.inkSoft, lineHeight: 19, marginBottom: 10 }}>{t('hod_report_desc')}</Text>
        <Button kind="primary" title={t('hod_report_send_btn')} onPress={sendReport} busy={busy === 'report'} />
      </Card>
    </Screen>
  );
}

function ReportList({ path, title }) {
  const { t, c } = useKit();
  const state = useData(path);
  const deptLabel = useDeptLabel();
  return (
    <Screen title={title} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Loaded state={state}>
        {(data) => data.reports.length === 0 ? <Note>{t('principal_reports_empty')}</Note> : data.reports.map((rep) => (
          <Card key={rep.id} title={deptLabel(rep.dept)} aside={formatTime(rep.sentAt)}>
            {rep.hodName ? <Text style={{ color: c.inkSoft, fontSize: 12.5, marginBottom: 4 }}>{rep.hodName}</Text> : null}
            {(rep.rows || []).map((row, i) => (
              <Row key={row.teacherId || row.name} first={i === 0} title={row.name} meta={teaching(t, row)}
                right={<Text style={{ color: c.inkSoft, fontSize: 12, textAlign: 'right' }}>
                  {(row.attendance ?? '–') + '% · ' + (row.performance ?? '–') + '%\n★ ' + (row.avgRating == null ? '–' : Number(row.avgRating).toFixed(1))}
                </Text>} />
            ))}
          </Card>
        ))}
      </Loaded>
    </Screen>
  );
}

export const HodReports = () => { const { t } = useKit(); return <ReportList path="/hod/reports" title={t('hod_report_title')} />; };
export const PrincipalReports = () => { const { t } = useKit(); return <ReportList path="/principal/reports" title={t('principal_reports_title')} />; };

// ---- principal ----

export function PrincipalTeachers() {
  const { t, has, token, c, showToast } = useKit();
  const state = useData('/principal/teachers');
  const [picked, setPicked] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const list = state.data ? state.data.teachers : [];
  const tc = list.find((x) => x.id === picked) || list[0];

  async function setWork(workDone) {
    setBusy('work');
    const { error: err } = await apiPatch(`/principal/teachers/${tc.id}/work-done`, { workDone }, token);
    setBusy(null);
    if (err) return showToast(errorText(t, has, err));
    state.reload();
  }
  async function sendFeedback() {
    setBusy('feedback');
    setError(null);
    const { error: err } = await apiPost(`/principal/teachers/${tc.id}/feedback`, { message: message.trim() }, token);
    setBusy(null);
    if (err) return setError(errorText(t, has, err));
    setMessage('');
    showToast(t('principal_feedback_sent_alert', { teacher: tc.name }));
  }

  return (
    <Screen title={t('principal_teachers_title')} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Loaded state={state}>
        {() => !tc ? <Note>{t('principal_teachers_empty')}</Note> : (
          <View>
            <Chips value={tc.id} onChange={(id) => { setPicked(id); setMessage(''); setError(null); }} items={list.map((x) => ({ id: x.id, label: x.name }))} />
            <Card>
              <Row first left={<Avatar text={initials(tc.name)} color={c.brand} />} title={tc.name} meta={teaching(t, tc)} />
              <Grid2>
                <Stat n={tc.attendance == null ? '–' : tc.attendance + '%'} label={t('hod_report_col_attendance')} />
                <Stat n={tc.performance == null ? '–' : tc.performance + '%'} label={t('hod_report_col_performance')} />
              </Grid2>
            </Card>
            <Card title={t('principal_oversight_title')}>
              <WorkDone teacher={tc} busy={busy === 'work'} onSet={setWork} />
              {tc.workDone === false ? <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 8 }}>{t('principal_reminder_note')}</Text> : null}
            </Card>
            <Card title={t('principal_ratings_title')}>
              {tc.ratings.count ? <Ratings ratings={tc.ratings} /> : <Empty text={t('hod_no_ratings')} />}
            </Card>
            <Card title={t('principal_send_feedback')}>
              <Field value={message} onChangeText={setMessage} placeholder={t('principal_feedback_placeholder')} multiline maxLength={2000} />
              <ErrorText>{error}</ErrorText>
              <Button kind="primary" title={t('principal_send_feedback')} onPress={sendFeedback} busy={busy === 'feedback'} disabled={!message.trim()} />
            </Card>
          </View>
        )}
      </Loaded>
    </Screen>
  );
}
