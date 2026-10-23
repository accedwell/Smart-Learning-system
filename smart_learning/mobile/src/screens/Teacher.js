// The teacher's app: their classes and who is at risk, quizzes (set one, see marks, make one
// from a question paper), online classes with the register, and papers.
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { apiDelete, apiPost, apiPut, errorText } from '../api';
import {
  Avatar, Bar, Button, Card, Chips, Choice, Empty, ErrorText, Field, Grid2, Icon, Loaded, Note, Pill, Row,
  Screen, Stat, StatusPill, formatTime, initials, scoreKind, useData, useKit,
} from '../ui';
import { HeaderButtons, openPaper } from './Common';

const className = (t, k) => `${k.name} · ${t(k.subjectKey)}`;

// ---- my class ----

export function TeacherClass() {
  const { t, has, token, lang, c } = useKit();
  const state = useData('/teacher/class');
  const feedback = useData('/teacher/feedback');
  const [classId, setClassId] = useState('all');
  const [tips, setTips] = useState({});

  async function suggest(l) {
    setTips((s) => ({ ...s, [l.id]: t('learner_ai_thinking') }));
    const { data, error } = await apiPost(`/teacher/class/${l.id}/suggestion`, { lang }, token);
    setTips((s) => ({ ...s, [l.id]: error ? errorText(t, has, error) : data.suggestion }));
  }

  const basis = (l) => {
    if (l.statusBasis === 'tests') return t('teacher_basis_tests', { pct: l.quizAverage, taken: l.quizAttempts, set: l.testsSet });
    if (l.statusBasis === 'checkin') return t('teacher_basis_checkin', { score: l.checkin.score, total: l.checkin.total });
    return l.testsSet > 0 ? t('teacher_basis_none_set', { n: l.testsSet }) : t('teacher_learner_no_data');
  };

  return (
    <Screen title={t('teacher_dashboard_title')} right={<HeaderButtons />} onRefresh={() => { state.reload(); feedback.reload(); }} refreshing={state.loading}>
      <Loaded state={state}>
        {(data) => {
          if (data.classes.length === 0) return <Note>{t('teacher_no_classes')}</Note>;
          const learners = data.learners
            .filter((l) => classId === 'all' || l.classIds.includes(classId))
            .sort((a, b) => ({ at_risk: 0, watch: 1, on_track: 2 }[a.status] ?? 3) - ({ at_risk: 0, watch: 1, on_track: 2 }[b.status] ?? 3));
          const risk = learners.filter((l) => l.status === 'at_risk').length;
          // a card per class, in order (10A, 10B, 10C, 11A...), learners most in need of help first
          const shownClasses = data.classes.filter((k) => classId === 'all' || k.id === classId);
          const learnerRow = (l, i) => (
            <Row key={l.id} first={i === 0} left={<Avatar text={initials(l.name)} color={c.brand} size={38} />}
              title={l.shortName || l.name}
              meta={<View>
                <Text style={{ color: c.inkSoft, fontSize: 12, marginTop: 2 }}>{basis(l)}</Text>
                <Bar pct={l.progress} color={l.status === 'at_risk' ? c.bad : l.status === 'watch' ? c.warn : c.good} />
                {l.status === 'at_risk' || l.status === 'watch' ? (
                  <Pressable onPress={() => suggest(l)} style={{ marginTop: 6 }}>
                    <Text style={{ color: c.brand, fontWeight: '600', fontSize: 12.5 }}>{t('teacher_suggest_btn')}</Text>
                  </Pressable>
                ) : null}
                {tips[l.id] ? <Note><Text style={{ color: c.ink, fontSize: 12.5 }}><Text style={{ fontWeight: '700' }}>{t('teacher_ai_prefix')}</Text>{tips[l.id]}</Text></Note> : null}
              </View>}
              right={<StatusPill status={l.status} />} />
          );
          return (
            <View>
              <Grid2>
                <Stat n={risk} label={t('m_at_risk_count')} color={c.bad} />
                <Stat n={learners.length} label={t('m_learners_count')} />
              </Grid2>
              <Chips value={classId} onChange={setClassId}
                items={[{ id: 'all', label: t('teacher_classes_filter_all') }, ...data.classes.map((k) => ({ id: k.id, label: className(t, k) }))]} />
              {shownClasses.map((k) => {
                const inClass = learners.filter((l) => l.classIds.includes(k.id));
                return (
                  <Card key={k.id} title={className(t, k)} aside={t('teacher_class_meta', { grade: t('grade_' + k.grade), n: inClass.length })}>
                    {inClass.length === 0 ? <Empty text={t('teacher_class_empty')} /> : inClass.map(learnerRow)}
                  </Card>
                );
              })}
              <Text style={{ color: c.inkSoft, fontSize: 12, marginBottom: 12 }}>{t('m_first_try_basis')} · {t('teacher_status_hint')}</Text>
            </View>
          );
        }}
      </Loaded>
      {feedback.data && feedback.data.feedback.length ? (
        <Card title={t('teacher_principal_feedback_title')}>
          {feedback.data.feedback.map((f, i) => (
            <Row key={f.id} first={i === 0} left={<Avatar icon="chatbox-ellipses" color={c.brand} size={36} />}
              meta={formatTime(f.sentAt)}><Text style={{ color: c.ink, lineHeight: 20 }}>{f.message}</Text></Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

// ---- quizzes ----

export function TeacherQuizzes() {
  const { t, has, token, c, push, showToast } = useKit();
  const state = useData('/teacher/quizzes');
  const classes = useData('/teacher/class');

  async function remove(q) {
    const { error } = await apiDelete(`/teacher/quizzes/${q.id}`, token);
    if (error) return showToast(errorText(t, has, error));
    state.reload();
  }

  const names = (ids) => (classes.data ? classes.data.classes.filter((k) => ids.includes(k.id)).map((k) => k.name).join(', ') : '');
  return (
    <Screen title={t('nav_quizzes')} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Button kind="primary" icon="add" title={t('nav_set_quiz')} onPress={() => push('quizBuilder', { onDone: state.reload })} style={{ marginBottom: 12 }} />
      <Card title={t('teacher_quiz_list_title')}>
        <Loaded state={state}>
          {(data) => data.quizzes.length === 0 ? <Empty text={t('teacher_quiz_list_empty')} /> : data.quizzes.map((q, i) => (
            <Row key={q.id} first={i === 0} left={<Avatar icon="document-text" color={c.brand} size={38} />}
              title={q.title} onPress={() => push('quizResults', { quiz: q })}
              meta={<View style={{ marginTop: 3, gap: 4 }}>
                <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>
                  {t('teacher_quiz_list_classes_meta', { classes: names(q.classIds), subject: t(q.subjectKey), n: q.questions.length })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {q.timeLimitMin ? <Pill text={t('teacher_quiz_time_limit_pill', { n: q.timeLimitMin })} /> : null}
                  <Pill kind="brand" text={t('teacher_quiz_taken_by', { n: q.resultCount })} />
                </View>
              </View>}
              right={<Pressable onPress={() => remove(q)} hitSlop={8} accessibilityLabel={t('teacher_quiz_delete_btn')}>
                <Icon name="trash-outline" color={c.bad} />
              </Pressable>} />
          ))}
        </Loaded>
        <Text style={{ color: c.inkSoft, fontSize: 12, marginTop: 6 }}>{t('teacher_quiz_risk_hint')}</Text>
      </Card>
    </Screen>
  );
}

export function QuizResults({ quiz }) {
  const { t, c } = useKit();
  const state = useData(`/teacher/quizzes/${quiz.id}/results`);
  return (
    <Screen back={t('nav_quizzes')} title={quiz.title} sub={t('teacher_quiz_first_try_title')} onRefresh={state.reload} refreshing={state.loading}>
      <Card>
        <Loaded state={state}>
          {(data) => data.results.length === 0 ? <Empty text={t('teacher_quiz_results_empty')} /> : data.results.map((r, i) => (
            <Row key={r.learnerId} first={i === 0} left={<Avatar text={initials(r.learner)} color={c.brand} size={36} />}
              title={r.learner}
              meta={r.attempts > 1 ? t('teacher_quiz_latest_meta', { score: r.score, total: r.total, n: r.attempts }) : formatTime(r.first.submittedAt)}
              right={<Pill kind={scoreKind(r.first.score, r.first.total)} text={t('teacher_quiz_first_try_pill', { score: r.first.score, total: r.first.total })} />} />
          ))}
        </Loaded>
      </Card>
    </Screen>
  );
}

// classes this teacher can send to, as tick-boxes
function ClassPicker({ classes, picked, onChange }) {
  const { t, c } = useKit();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13, marginBottom: 5 }}>{t('teacher_classes_label')}</Text>
      {classes.map((k) => {
        const on = picked.includes(k.id);
        return (
          <Pressable key={k.id} onPress={() => onChange(on ? picked.filter((x) => x !== k.id) : [...picked, k.id])}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Icon name={on ? 'checkbox' : 'square-outline'} color={on ? c.brand : c.inkSoft} size={24} />
            <Text style={{ color: c.ink, fontSize: 15 }}>{className(t, k)} · {t('grade_' + k.grade)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuizBuilder({ onDone }) {
  const { t, has, token, c, pop, showToast } = useKit();
  const classes = useData('/teacher/class');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState([]);
  const [minutes, setMinutes] = useState(0);
  const [questions, setQuestions] = useState([{ text: '', answer: '' }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const setQ = (i, field, v) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, [field]: v } : q)));

  async function publish() {
    const clean = questions.filter((q) => q.text.trim() && q.answer.trim());
    if (!title.trim() || clean.length === 0) return setError(t('teacher_quiz_validation_alert'));
    if (picked.length === 0) return setError(t('teacher_class_pick_required'));
    setBusy(true);
    const { error: err } = await apiPost('/teacher/quizzes', {
      title: title.trim(), classIds: picked, timeLimitMin: minutes,
      questions: clean.map((q) => ({ text: q.text.trim(), answer: q.answer.trim() })),
    }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    showToast(t('teacher_quiz_published_classes_note', { title: title.trim() }));
    if (onDone) onDone();
    pop();
  }

  return (
    <Screen back={t('nav_quizzes')} title={t('teacher_quiz_builder_title')} sub={t('teacher_quiz_builder_sub')}>
      <Card>
        <Field label={t('teacher_quiz_title_label')} value={title} onChangeText={setTitle} placeholder={t('teacher_quiz_title_placeholder')} maxLength={150} />
        {classes.data ? <ClassPicker classes={classes.data.classes} picked={picked} onChange={setPicked} /> : null}
        <Choice label={t('teacher_quiz_time_limit_label')} value={minutes} onChange={setMinutes}
          options={[0, 5, 10, 15, 30].map((n) => ({ id: n, label: n ? t('teacher_quiz_time_limit_pill', { n }) : t('m_no_limit') }))} />
      </Card>
      {questions.map((q, i) => (
        <Card key={i} title={t('teacher_quiz_question_n', { n: i + 1 })}
          aside={questions.length > 1 ? (
            <Text onPress={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} style={{ color: c.bad, fontWeight: '600' }}>{t('teacher_quiz_remove_question')}</Text>
          ) : null}>
          <Field value={q.text} onChangeText={(v) => setQ(i, 'text', v)} placeholder={t('teacher_quiz_question_placeholder')} multiline />
          <Field label={t('teacher_quiz_answer_label')} value={q.answer} onChangeText={(v) => setQ(i, 'answer', v)} placeholder={t('teacher_quiz_answer_placeholder')} />
        </Card>
      ))}
      <Button title={t('teacher_quiz_add_question')} onPress={() => setQuestions((qs) => [...qs, { text: '', answer: '' }])} style={{ marginBottom: 12 }} />
      <ErrorText>{error}</ErrorText>
      <Button kind="primary" title={t('teacher_quiz_publish_btn')} onPress={publish} busy={busy} />
    </Screen>
  );
}

// ---- papers, and a quiz made from one ----

export function TeacherPapers() {
  const { t, has, token, c, push, showToast } = useKit();
  const state = useData('/teacher/papers');
  const [busy, setBusy] = useState(null);

  async function makeQuiz(p) {
    setBusy(p.id);
    const { data, error } = await apiPost(`/teacher/papers/${p.id}/generate-quiz`, {}, token);
    setBusy(null);
    if (error) return showToast(errorText(t, has, error));
    push('paperQuiz', { paper: p, result: data });
  }

  async function view(p) {
    try { await openPaper(p, token); } catch { showToast(t('m_paper_open_error')); }
  }

  return (
    <Screen title={t('teacher_papers_title')} sub={t('m_upload_on_web')} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Card>
        <Loaded state={state}>
          {(data) => data.papers.length === 0 ? <Empty text={t('paper_list_empty')} /> : data.papers.map((p, i) => (
            <Row key={p.id} first={i === 0} left={<Avatar icon="document-text" color={c.brand} size={38} />}
              title={p.title} meta={`${t(p.subjectKey)} · ${p.fileName}`}>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Button small title={t('paper_view')} onPress={() => view(p)} />
                <Button small kind="primary" title={t('paper_quiz_btn')} busy={busy === p.id} onPress={() => makeQuiz(p)} />
              </View>
            </Row>
          ))}
        </Loaded>
        {busy ? <Note>{t('quizgen_loading')}</Note> : null}
      </Card>
    </Screen>
  );
}

export function PaperQuiz({ paper, result }) {
  const { t, has, token, c, pop, showToast } = useKit();
  const [picked, setPicked] = useState(() => result.questions.map((_, i) => i).filter((i) => !result.questions[i].needsAnswer));
  const [answers, setAnswers] = useState({});
  const [title, setTitle] = useState(t('quizgen_default_title', { title: paper.title }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const total = result.questions.length;

  async function publish() {
    if (picked.length === 0) return setError(t('quizgen_pick_one'));
    const chosen = picked.sort((a, b) => a - b).map((i) => {
      const q = result.questions[i];
      return { text: q.text, answer: (q.needsAnswer ? answers[i] || '' : q.answer).trim() };
    });
    if (chosen.some((q) => !q.answer)) return setError(t('quizgen_need_answers'));
    setBusy(true);
    const { error: err } = await apiPost('/teacher/quizzes', { title: title.trim(), classIds: result.classIds, timeLimitMin: 0, questions: chosen }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    showToast(t('teacher_quiz_published_classes_note', { title: title.trim() }));
    pop();
  }

  return (
    <Screen back={t('teacher_papers_title')} title={t('quizgen_title')}
      sub={t(result.source === 'ai' ? 'quizgen_source_ai' : 'quizgen_source_text', { title: paper.title })}>
      <Card title={t('quizgen_selected', { n: picked.length, total })}
        aside={<Text onPress={() => setPicked(picked.length === total ? [] : result.questions.map((_, i) => i))} style={{ color: c.brand, fontWeight: '700' }}>
          {picked.length === total ? t('quizgen_clear') : t('quizgen_select_all')}
        </Text>}>
        {result.questions.map((q, i) => {
          const on = picked.includes(i);
          return (
            <Row key={i} first={i === 0}
              onPress={() => setPicked(on ? picked.filter((x) => x !== i) : [...picked, i])}
              left={<Icon name={on ? 'checkbox' : 'square-outline'} color={on ? c.brand : c.inkSoft} size={24} />}
              meta={q.needsAnswer ? t('quizgen_from_paper') : t('quizgen_answer', { answer: q.answer })}>
              <Text style={{ color: c.ink, fontSize: 15, lineHeight: 21 }}>{q.text}</Text>
              {q.needsAnswer && on ? (
                <Field value={answers[i] || ''} onChangeText={(v) => setAnswers((a) => ({ ...a, [i]: v }))} placeholder={t('quizgen_answer_placeholder')} style={{ marginTop: 8 }} />
              ) : null}
            </Row>
          );
        })}
      </Card>
      <Card>
        <Field label={t('quizgen_quiz_title')} value={title} onChangeText={setTitle} maxLength={150} />
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" title={t('quizgen_publish_btn', { n: picked.length })} onPress={publish} busy={busy} disabled={!title.trim()} />
      </Card>
    </Screen>
  );
}

// ---- online classes and the register ----

function dayOptions(t) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({ id: i, label: i === 0 ? t('m_today') : i === 1 ? t('m_tomorrow') : d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' }) });
  }
  return out;
}

export function TeacherOnline() {
  const { t, has, token, c, push, showToast } = useKit();
  const state = useData('/teacher/online-classes');
  const classes = useData('/teacher/class');
  const [classId, setClassId] = useState(null);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('14:00');
  const [duration, setDuration] = useState(45);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => dayOptions(t), [t]);

  async function schedule() {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return setError(t('m_time_format'));
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + day);
    startsAt.setHours(+m[1], +m[2], 0, 0);
    if (startsAt.getTime() <= Date.now()) return setError(t('online_error_past'));
    setBusy(true);
    setError(null);
    const { error: err } = await apiPost('/teacher/online-classes', { classId, title: title.trim(), startsAt: startsAt.toISOString(), durationMin: duration }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    setTitle('');
    showToast(t('online_created_note'));
    state.reload();
  }

  return (
    <Screen title={t('nav_online_classes')} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Card title={t('online_new_title')}>
        {classes.data ? (
          <Choice label={t('online_class_label')} value={classId} onChange={setClassId}
            options={classes.data.classes.map((k) => ({ id: k.id, label: className(t, k) }))} />
        ) : null}
        <Field label={t('online_topic_label')} value={title} onChangeText={setTitle} placeholder={t('online_topic_placeholder')} maxLength={150} />
        <Choice label={t('online_start_label')} value={day} onChange={setDay} options={days} />
        <Field label={t('m_time_label')} value={time} onChangeText={setTime} placeholder="14:00" keyboardType="numbers-and-punctuation" maxLength={5} />
        <Choice label={t('online_duration_label')} value={duration} onChange={setDuration}
          options={[30, 45, 60, 90].map((n) => ({ id: n, label: t('teacher_quiz_time_limit_pill', { n }).replace('⏱ ', '') }))} />
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" title={t('online_create_btn')} onPress={schedule} busy={busy} disabled={!classId || !title.trim()} />
        <Text style={{ color: c.inkSoft, fontSize: 12, marginTop: 8 }}>{t('m_teach_on_web')}</Text>
      </Card>

      <Card title={t('online_list_title')}>
        <Loaded state={state}>
          {(data) => data.onlineClasses.length === 0 ? <Empty text={t('online_list_empty')} /> : data.onlineClasses.map((o, i) => (
            <Row key={o.id} first={i === 0} left={<Avatar icon="videocam" color={o.phase === 'open' ? c.bad : c.brand} size={38} />}
              title={o.title} onPress={() => push('register', { onlineClass: o, onChange: state.reload })}
              meta={<View style={{ marginTop: 3, gap: 4 }}>
                <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t('online_meta', { class: o.className, time: formatTime(o.startsAt), n: o.durationMin })}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Pill kind={o.phase === 'open' ? 'live' : 'soft'} text={t('online_phase_' + o.phase)} />
                  {o.phase !== 'upcoming' ? <Pill kind="brand" text={t('online_counts', { present: o.present, late: o.late, absent: Math.max(0, o.learners - o.present - o.late) })} /> : null}
                </View>
              </View>}
              right={<Icon name="chevron-forward" color={c.inkSoft} />} />
          ))}
        </Loaded>
      </Card>
    </Screen>
  );
}

const MARKS = [['present', 'good'], ['late', 'warn'], ['absent', 'bad']];

export function Register({ onlineClass, onChange }) {
  const { t, has, token, c, pop, showToast } = useKit();
  const state = useData(`/teacher/online-classes/${onlineClass.id}/register`);
  const [busy, setBusy] = useState(false);

  async function mark(learnerId, status) {
    const { error } = await apiPut(`/teacher/online-classes/${onlineClass.id}/register/${learnerId}`, { status }, token);
    if (error) return showToast(errorText(t, has, error));
    state.reload();
    if (onChange) onChange();
  }
  async function act(kind) {
    setBusy(true);
    const { error } = kind === 'end'
      ? await apiPost(`/teacher/online-classes/${onlineClass.id}/end`, {}, token)
      : await apiDelete(`/teacher/online-classes/${onlineClass.id}`, token);
    setBusy(false);
    if (error) return showToast(errorText(t, has, error));
    if (onChange) onChange();
    pop();
  }

  return (
    <Screen back={t('nav_online_classes')} title={onlineClass.title}
      sub={t('online_meta', { class: onlineClass.className, time: formatTime(onlineClass.startsAt), n: onlineClass.durationMin })}
      onRefresh={state.reload} refreshing={state.loading}>
      <Card title={t('online_register_btn')}>
        <Loaded state={state}>
          {(data) => data.register.length === 0 ? <Empty text={t('online_register_empty')} /> : data.register.map((r, i) => (
            <Row key={r.learnerId} first={i === 0} title={r.name}
              meta={[r.inRoom ? t('online_in_room') : null, r.joinedAt ? t('online_joined_at', { time: formatTime(r.joinedAt) }) : null,
                r.minutes ? t('online_minutes', { n: r.minutes }) : null, r.markedBy === 'teacher' ? t('online_marked_by_teacher') : null]
                .filter(Boolean).join(' · ') || t('online_status_not_joined')}>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {MARKS.map(([status, kind]) => {
                  const on = r.status === status;
                  return (
                    <Pressable key={status} onPress={() => mark(r.learnerId, on ? null : status)}
                      style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1.5, borderColor: on ? c[kind] : c.border, backgroundColor: on ? c[kind] : c.surface }}>
                      <Text style={{ color: on ? '#fff' : c.ink, fontWeight: '700', fontSize: 12.5 }}>{t('online_status_' + status)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Row>
          ))}
        </Loaded>
      </Card>
      {onlineClass.phase === 'open' ? <Button kind="danger" title={t('online_end_btn')} onPress={() => act('end')} busy={busy} style={{ marginBottom: 10 }} /> : null}
      {onlineClass.phase === 'upcoming' ? <Button kind="danger" title={t('online_cancel_btn')} onPress={() => act('cancel')} busy={busy} /> : null}
    </Screen>
  );
}
