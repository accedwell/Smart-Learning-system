// The parent's app: only the children the school administrator linked to them.
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Bar, Button, Card, Chips, Empty, Hero, Loaded, Note, Pill, Row, Screen, StatusPill, formatDate, formatTime, scoreKind, useData, useKit,
} from '../ui';
import { HeaderButtons, saveFile } from './Common';

// The child's progress report as a PDF (made by the server): opens in the phone's PDF viewer,
// from where the parent can also save it or share it.
// saves the report PDF on the phone (the parent picks the folder, e.g. Downloads)
function useDownloadReport(child) {
  const { t, token, showToast } = useKit();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const saved = await saveFile(`/api/parent/children/${child.id}/report.pdf`, `${child.name}-progress-report.pdf`, 'application/pdf', token, t('parent_report_title'));
      if (saved) showToast(t('parent_report_saved'));
    } catch {
      showToast(t('m_paper_open_error'));
    }
    setBusy(false);
  }
  return [download, busy];
}

function ReportCard({ child }) {
  const { t, push } = useKit();
  const [download, busy] = useDownloadReport(child);
  const first = child.name.split(' ')[0];
  return (
    <Card title={t('parent_report_title')} aside={first}>
      <Note>{t('parent_report_desc', { child: first })}</Note>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        <Button icon="eye-outline" title={t('parent_report_view_btn')} onPress={() => push('childReport', { childId: child.id })} style={{ flex: 1 }} />
        <Button kind="primary" icon="download-outline" title={t('parent_report_download_short')} onPress={download} busy={busy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// A lesson's subject (from its assessment), shown as the row's heading, with the lesson and its
// assessment underneath.
const subjectOf = (t, l) => (l.subjectKey ? t(l.subjectKey) : t(l.key));

function LessonLines({ t, c, l }) {
  const hasSubject = Boolean(l.subjectKey);
  const subject = hasSubject ? t(l.subjectKey) : '';
  return (
    <View style={{ marginTop: 2 }}>
      {hasSubject ? <Text style={{ color: c.ink, fontSize: 13.5 }}>{t('parent_lesson_line', { lesson: t(l.key, { subject }) })}</Text> : null}
      {l.assessment ? (
        <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 2 }}>
          {t('parent_assessment_line', { title: t(l.assessment.titleKey, { subject }), date: l.assessment.due })}
        </Text>
      ) : null}
    </View>
  );
}

const STATUS_TEXT = { on_track: 'quiz_status_good', watch: 'quiz_status_watch', at_risk: 'quiz_status_bad' };
const day = formatDate;

// The whole report on screen, as in the PDF, with the download button at the bottom.
export function ChildReport({ childId }) {
  const { t, c } = useKit();
  const state = useData(`/parent/children/${childId}`);
  return (
    <Screen back={t('parent_progress_title')} title={t('parent_report_title')} onRefresh={state.reload} refreshing={state.loading}>
      <Loaded state={state}>
        {(r) => <ReportBody r={r} t={t} c={c} />}
      </Loaded>
    </Screen>
  );
}

function ReportBody({ r, t, c }) {
  const [download, busy] = useDownloadReport(r.child);
  const a = r.attendance;
  const fact = (label, value) => <Row title={label} right={<Text style={{ color: c.ink, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{value}</Text>} />;
  return (
    <View>
      <Hero>
        <Text style={{ color: '#f2b25a', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>SMART LEARNING</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>{r.child.name}</Text>
        <Text style={{ color: '#ffffffcc', fontSize: 13, marginTop: 2 }}>{t('m_report_generated', { date: day(r.generatedAt) })}</Text>
      </Hero>

      <Card>
        {r.child.grade ? <Row first title={t('login_grade_label')} right={<Text style={{ color: c.ink, fontWeight: '700' }}>{t('grade_' + r.child.grade)}</Text>} /> : null}
        {r.child.idNumber ? fact(t('login_id_label'), r.child.idNumber) : null}
        {fact(t('parent_progress_title'), `${r.child.progress || 0}%`)}
        <Row title={t('m_status')} right={<StatusPill status={r.status} />} />
        {r.status ? <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 6 }}>{t(STATUS_TEXT[r.status])}</Text> : null}
      </Card>

      <Card title={t('parent_lessons_title', { child: r.child.name.split(' ')[0] })}>
        {r.lessons.map((l, i) => (
          <Row key={l.id} first={i === 0} title={subjectOf(t, l)}
            meta={<LessonLines t={t} c={c} l={l} />}
            right={l.done ? <Pill kind="good" text={t('learner_completed')} /> : <Text style={{ color: c.inkSoft }}>{l.progress}%</Text>} />
        ))}
      </Card>

      <Card title={t('parent_quiz_marks_title')}>
        {r.quizMarks.length === 0 ? <Empty text={t('parent_quiz_marks_empty', { child: r.child.name })} /> : r.quizMarks.map((m, i) => (
          <Row key={m.quizId} first={i === 0} title={m.title}
            meta={[m.subjectKey ? t(m.subjectKey) : null, day(m.submittedAt)].filter(Boolean).join(' · ')}
            right={<Pill kind={scoreKind(m.score, m.total)} text={`${m.score}/${m.total}`} />} />
        ))}
        {r.checkin ? <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 8 }}>{t('quiz_title')}: {t('quiz_score_caption', { correct: r.checkin.score, total: r.checkin.total })}</Text> : null}
      </Card>

      <Card title={t('nav_online_classes')}>
        <Text style={{ color: c.ink, lineHeight: 20 }}>{a.total ? t('parent_attendance_line', a) : t('parent_attendance_none')}</Text>
        {a.classes.slice(0, 15).map((oc, i) => (
          <Row key={i} title={oc.title} meta={`${t(oc.subjectKey)} · ${day(oc.startsAt)}`}
            right={<Pill kind={{ present: 'good', late: 'warn', absent: 'bad' }[oc.status]} text={t('online_status_' + oc.status)} />} />
        ))}
      </Card>

      <Button kind="primary" icon="download-outline" title={t('parent_download_btn')} onPress={download} busy={busy} />
    </View>
  );
}

export function ParentChild() {
  const { t, c } = useKit();
  const children = useData('/parent/children');
  const [picked, setPicked] = useState(null);
  const list = children.data ? children.data.children : [];
  const child = list.find((ch) => ch.id === picked) || list[0];
  const detail = useData(child ? `/parent/children/${child.id}` : null);

  return (
    <Screen title={child ? child.name.split(' ')[0] : t('parent_progress_title')} sub={child && child.grade ? t('grade_' + child.grade) : null}
      right={<HeaderButtons />} onRefresh={() => { children.reload(); detail.reload(); }} refreshing={children.loading}>
      <Loaded state={children}>
        {() => list.length === 0 ? (
          <Card title={t('parent_no_child_title')}><Text style={{ color: c.inkSoft, lineHeight: 20 }}>{t('parent_no_child')}</Text></Card>
        ) : (
          <View>
            {list.length > 1 ? <Chips value={child.id} onChange={setPicked} items={list.map((ch) => ({ id: ch.id, label: ch.name }))} /> : null}
            <Loaded state={detail}>
              {(d) => (
                <View>
                  <Hero>
                    <Text style={{ color: '#ffffffdd', fontSize: 13 }}>{t('parent_progress_title')}</Text>
                    <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800' }}>{d.child.progress || 0}%</Text>
                    <Bar pct={d.child.progress} color="#f2b25a" track="rgba(255,255,255,0.18)" />
                    <Text style={{ color: '#ffffffdd', fontSize: 13, marginTop: 8 }}>{t('parent_progress_caption', { pct: d.child.progress || 0 })}</Text>
                  </Hero>
                  {d.status ? <Card><Row first title={t('m_status')} right={<StatusPill status={d.status} />} /></Card> : null}
                  <Card title={t('parent_quiz_marks_title')} aside={d.child.name}>
                    {d.quizMarks.length === 0 ? <Empty text={t('parent_quiz_marks_empty', { child: d.child.name })} /> : d.quizMarks.map((m, i) => (
                      <Row key={m.quizId + '-' + m.submittedAt} first={i === 0} title={m.title}
                        meta={[m.subjectKey ? t(m.subjectKey) : null, formatTime(m.submittedAt)].filter(Boolean).join(' · ')}
                        right={<Pill kind={scoreKind(m.score, m.total)} text={`${m.score}/${m.total}`} />} />
                    ))}
                  </Card>
                  <Card title={t('parent_lessons_title', { child: d.child.name.split(' ')[0] })}>
                    {d.lessons.map((l, i) => (
                      <Row key={l.id} first={i === 0} title={subjectOf(t, l)}
                        meta={<View>
                          <LessonLines t={t} c={c} l={l} />
                          <Bar pct={l.progress} color={l.done ? c.good : c.brand} />
                        </View>}
                        right={l.done ? <Pill kind="good" text={t('learner_completed')} /> : <Text style={{ color: c.inkSoft }}>{l.progress}%</Text>} />
                    ))}
                  </Card>
                  {d.checkin ? (
                    <Note>{t('quiz_title')}: {t('quiz_score_caption', { correct: d.checkin.score, total: d.checkin.total })}</Note>
                  ) : null}
                  {d.attendance ? (
                    <Card title={t('nav_online_classes')}>
                      <Text style={{ color: c.ink, lineHeight: 20 }}>
                        {d.attendance.total ? t('parent_attendance_line', d.attendance) : t('parent_attendance_none')}
                      </Text>
                    </Card>
                  ) : null}
                  <ReportCard child={d.child} />
                </View>
              )}
            </Loaded>
          </View>
        )}
      </Loaded>
    </Screen>
  );
}
