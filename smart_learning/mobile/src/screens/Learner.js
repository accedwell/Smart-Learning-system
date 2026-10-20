// The learner's app: lessons and progress, their teachers' quizzes and the check-in quiz,
// online classes and question papers. Rating teachers is on the profile tab.
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { apiGet, apiPost, apiPut, errorText } from '../api';
import {
  Avatar, Bar, Button, Card, Chips, Empty, ErrorText, Field, Hero, Icon, Loaded, Note, Pill, Row,
  Screen, Sheet, formatTime, scoreKind, useData, useKit,
} from '../ui';
import { HeaderButtons, openPaper, openWebApp } from './Common';

const SUBJECT_ICON = { subject_1: 'calculator', subject_2: 'book', subject_3: 'leaf' };
const subjectIcon = (key) => SUBJECT_ICON[key] || 'school';

// ---- home ----

export function LearnerHome() {
  const { t, has, lang, token, user, c, switchTab, showToast } = useKit();
  const lessons = useData('/learner/lessons');
  const online = useData('/learner/online-classes');
  const quizzes = useData('/learner/quizzes');
  const [open, setOpen] = useState(null); // the lesson whose assessment is showing
  const [busy, setBusy] = useState(null);
  const [tip, setTip] = useState(null);
  const [error, setError] = useState(null);

  const list = lessons.data ? lessons.data.lessons : [];
  const pct = list.length ? Math.round(list.reduce((a, l) => a + l.progress, 0) / list.length) : user.progress || 0;
  const live = online.data ? online.data.onlineClasses.find((o) => o.phase === 'open') : null;
  const todo = quizzes.data ? quizzes.data.quizzes.filter((q) => !q.firstTry).slice(0, 3) : [];

  async function viewAssessment(lesson) {
    setOpen(lesson);
    if (lesson.assessmentViewed) return;
    const { error: err } = await apiPost(`/learner/lessons/${lesson.id}/assessment-viewed`, {}, token);
    if (err) setError(errorText(t, has, err));
    else lessons.reload();
  }

  async function complete(lesson) {
    setBusy(lesson.id);
    setError(null);
    setTip(t('learner_ai_thinking'));
    const { data, error: err } = await apiPost(`/learner/lessons/${lesson.id}/complete`, { lang }, token);
    setBusy(null);
    if (err) { setTip(null); return setError(errorText(t, has, err)); }
    setTip(data.recommendation);
    showToast(t('learner_completed'));
    lessons.reload();
  }

  const reloadAll = () => { lessons.reload(); online.reload(); quizzes.reload(); };
  return (
    <Screen title={t('m_hello', { name: user.name.split(' ')[0] })} sub={t('grade_' + user.grade)} right={<HeaderButtons />}
      onRefresh={reloadAll} refreshing={lessons.loading}>
      <Hero>
        <Text style={{ color: '#ffffffdd', fontSize: 13 }}>{t('m_my_progress')}</Text>
        <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800' }}>{pct}%</Text>
        <Bar pct={pct} color="#f2b25a" track="rgba(255,255,255,0.18)" />
        <Text style={{ color: '#ffffffdd', fontSize: 13, marginTop: 8 }}>
          {t('m_lessons_done', { done: list.filter((l) => l.done).length, total: list.length })}
        </Text>
      </Hero>

      {live ? (
        <Card accent={c.bad}>
          <Row first left={<Avatar icon="videocam" color={c.brand} />} title={live.title}
            meta={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{live.teacherName}</Text><Pill kind="live" text={'● ' + t('online_phase_open')} />
            </View>}
            right={<Button small kind="primary" title={t('learner_online_join_btn')} onPress={() => switchTab('online')} />} />
        </Card>
      ) : null}

      <Card title={t('learner_lessons_title')}>
        <ErrorText>{error}</ErrorText>
        <Loaded state={lessons}>
          {() => list.map((l, i) => (
            <Row key={l.id} first={i === 0} title={l.subjectKey ? t(l.subjectKey) : t(l.key)}
              meta={<View>
                {l.subjectKey ? <Text style={{ color: c.ink, fontSize: 13.5, marginTop: 1 }}>{t(l.key, { subject: t(l.subjectKey) })}</Text> : null}
                <Bar pct={l.progress} color={l.done ? c.good : c.brand} />
                {l.assessment ? (
                  <Pressable onPress={() => viewAssessment(l)} style={{ marginTop: 7 }}>
                    <Text style={{ color: c.brand, fontWeight: '600', fontSize: 12.5 }}>
                      {t('assess_view_btn')} · {t('assess_due', { date: l.assessment.due })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>}
              right={l.done ? <Pill kind="good" text={t('learner_completed')} />
                : <Button small kind={l.assessmentViewed ? 'primary' : 'plain'} title={t('learner_mark_complete')}
                  disabled={!l.assessmentViewed} busy={busy === l.id} onPress={() => complete(l)} />} />
          ))}
        </Loaded>
        {tip ? <Note><Text style={{ color: c.ink, lineHeight: 19 }}><Text style={{ fontWeight: '700' }}>{t('learner_ai_prefix')}</Text>{tip}</Text></Note>
          : <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 6 }}>{list.some((l) => !l.done && !l.assessmentViewed) ? t('assess_gate_note') : t('learner_ai_placeholder')}</Text>}
      </Card>

      <Card title={t('learner_quizzes_title')}>
        {todo.length === 0 ? <Empty text={t('learner_quizzes_empty')} /> : todo.map((q, i) => (
          <Row key={q.id} first={i === 0} left={<Avatar icon={subjectIcon(q.subjectKey)} color={c.brand} size={38} />}
            title={q.title} meta={`${t(q.subjectKey)} · ${t('m_questions', { n: q.questionCount })}`}
            right={<Button small kind="primary" title={t('learner_quiz_take_btn')} onPress={() => switchTab('quizzes')} />} />
        ))}
      </Card>

      <Sheet visible={Boolean(open)} title={open && open.assessment ? t(open.assessment.titleKey, { subject: t(open.assessment.subjectKey) }) : ''}
        sub={open && open.assessment ? t('assess_due', { date: open.assessment.due }) : ''} onClose={() => setOpen(null)}>
        {open && open.assessment ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{t(open.assessment.descKey, { subject: t(open.assessment.subjectKey) })}</Text>
            <Note kind="good">{t('assess_viewed_note')}</Note>
            <Button kind="primary" title={t('learner_mark_complete')} disabled={open.done}
              onPress={() => { const l = open; setOpen(null); complete(l); }} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

// ---- quizzes ----

export function LearnerQuizzes() {
  const { t, c, push } = useKit();
  const [subject, setSubject] = useState('all');
  const state = useData('/learner/quizzes' + (subject === 'all' ? '' : '?subjectKey=' + encodeURIComponent(subject)));
  const checkin = useData('/learner/checkin');

  return (
    <Screen title={t('nav_quizzes')} sub={t('m_first_try_counts')} right={<HeaderButtons />}
      onRefresh={() => { state.reload(); checkin.reload(); }} refreshing={state.loading}>
      {state.data ? (
        <Chips value={subject} onChange={setSubject}
          items={[{ id: 'all', label: t('learner_quiz_filter_all') }, ...state.data.subjects.map((s) => ({ id: s, label: t(s) }))]} />
      ) : null}
      <Card title={t('learner_quizzes_title')}>
        <Loaded state={state}>
          {(data) => data.quizzes.length === 0
            ? <Empty text={subject === 'all' ? t('learner_quizzes_empty') : t('learner_quiz_filter_empty', { subject: t(subject) })} />
            : data.quizzes.map((q, i) => {
              const inProgress = q.attempt && !q.attempt.submitted;
              return (
                <Row key={q.id} first={i === 0} left={<Avatar icon={subjectIcon(q.subjectKey)} color={c.brand} size={38} />}
                  title={q.title}
                  meta={<View style={{ marginTop: 3, gap: 4 }}>
                    <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>
                      {t(q.subjectKey)} · {q.teacherName} · {t('m_questions', { n: q.questionCount })}{q.timeLimitMin ? ' · ' + t('teacher_quiz_time_limit_pill', { n: q.timeLimitMin }) : ''}
                    </Text>
                    {q.firstTry ? <Pill kind={scoreKind(q.firstTry.score, q.firstTry.total)} text={t('learner_quiz_first_try_pill', q.firstTry)} /> : null}
                  </View>}
                  right={<Button small kind={q.firstTry && !inProgress ? 'plain' : 'primary'}
                    title={inProgress ? t('learner_quiz_continue_btn') : q.firstTry ? t('learner_quiz_practise_btn') : t('learner_quiz_take_btn')}
                    onPress={() => push('quiz', { quiz: q, onDone: state.reload })} />} />
              );
            })}
        </Loaded>
        <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 6 }}>{t('learner_quiz_practice_note')}</Text>
      </Card>

      <Card title={t('quiz_title')}>
        <Text style={{ color: c.inkSoft, lineHeight: 19, marginBottom: 10 }}>{t('quiz_intro')}</Text>
        {checkin.data && checkin.data.latest ? (
          <View style={{ marginBottom: 10 }}>
            <Pill kind={scoreKind(checkin.data.latest.score, checkin.data.latest.total)}
              text={t('quiz_score_caption', { correct: checkin.data.latest.score, total: checkin.data.latest.total })} />
          </View>
        ) : null}
        <Button title={checkin.data && checkin.data.latest ? t('quiz_retake_btn') : t('quiz_start_btn')}
          onPress={() => push('checkin', { onDone: checkin.reload })} />
      </Card>
    </Screen>
  );
}

const pad = (n) => String(n).padStart(2, '0');

// one of the teacher's tests: typed answers, one question at a time, with the time limit
export function QuizTake({ quiz, onDone }) {
  const { t, has, token, c, pop } = useKit();
  const [state, setState] = useState(null); // { quiz, attempt } from /start
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null); // the submit response
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const submitted = useRef(false);

  useEffect(() => {
    (async () => {
      const retake = Boolean(quiz.attempt && quiz.attempt.submitted);
      const { data, error: err } = await apiPost(`/learner/quizzes/${quiz.id}/start`, { retake }, token);
      if (err) return setError(errorText(t, has, err));
      setState(data);
      setAnswers(data.quiz.questions.map(() => ''));
    })();
  }, [quiz, token, t, has]);

  const deadline = state && state.attempt.deadline ? new Date(state.attempt.deadline).getTime() : null;
  const left = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null;

  useEffect(() => {
    if (!deadline || result) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline, result]);

  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    const { data, error: err } = await apiPost(`/learner/quizzes/${quiz.id}/submit`, { answers }, token);
    setBusy(false);
    if (err) { submitted.current = false; return setError(errorText(t, has, err)); }
    setResult(data);
    if (onDone) onDone();
  }

  // time's up: hand in what is there
  useEffect(() => { if (left === 0 && state && !result) submit(); }); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !state) return <Screen back={t('learner_quiz_back_btn').replace('← ', '')}><Note kind="bad">{error}</Note></Screen>;
  if (!state) return <Screen back={t('learner_quiz_back_btn').replace('← ', '')}><Text style={{ color: c.inkSoft }}>{t('online_loading')}</Text></Screen>;

  if (result) {
    const { score, total, timedOut } = result.attempt;
    return (
      <Screen back={t('learner_quiz_back_btn').replace('← ', '')} title={quiz.title}>
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 44, fontWeight: '800', color: c[scoreKind(score, total)] }}>{score}/{total}</Text>
          <Text style={{ color: c.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
            {t({ good: 'quiz_status_good', warn: 'quiz_status_watch', bad: 'quiz_status_bad' }[scoreKind(score, total)])}
          </Text>
          {timedOut ? <Note kind="bad">{t('learner_quiz_time_up_note')}</Note> : null}
          <Note>{result.firstTry ? t('learner_quiz_first_try_note') : t('learner_quiz_practice_try_note')}</Note>
        </Card>
        <Card title={t('quiz_result_title')}>
          {result.review.map((r, i) => (
            <Row key={i} first={i === 0} title={r.text}
              meta={<View style={{ marginTop: 3 }}>
                <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t('learner_quiz_your_answer', { answer: r.given || '—' })}</Text>
                {!r.correct ? <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t('learner_quiz_right_answer', { answer: r.answer })}</Text> : null}
              </View>}
              right={<Pill kind={r.correct ? 'good' : 'bad'} text={r.correct ? t('learner_quiz_correct') : t('learner_quiz_wrong')} />} />
          ))}
        </Card>
        <Button kind="primary" title={t('m_done')} onPress={pop} />
      </Screen>
    );
  }

  const questions = state.quiz.questions;
  const last = index === questions.length - 1;
  return (
    <Screen back={t('learner_quiz_back_btn').replace('← ', '')} title={quiz.title}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: c.inkSoft }}>{t('learner_quiz_progress', { current: index + 1, total: questions.length })}</Text>
        {left != null ? <Text style={{ color: left < 30 ? c.bad : c.brand, fontWeight: '800' }}>⏱ {pad(Math.floor(left / 60))}:{pad(left % 60)}</Text> : null}
      </View>
      <Bar pct={(index / questions.length) * 100} color={c.brand} />
      <Text style={{ color: c.ink, fontSize: 21, fontWeight: '800', lineHeight: 28, marginVertical: 18 }}>{questions[index].text}</Text>
      <Field value={answers[index]} onChangeText={(v) => setAnswers((a) => a.map((x, i) => (i === index ? v : x)))}
        placeholder={t('learner_quiz_answer_placeholder')} autoFocus maxLength={200} autoCapitalize="none" />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {index > 0 ? <Button title={t('learner_quiz_prev_btn')} onPress={() => setIndex(index - 1)} style={{ flex: 1 }} /> : null}
        <Button kind="primary" style={{ flex: 2 }} busy={busy}
          title={last ? t('learner_quiz_submit_btn') : t('learner_quiz_next_btn')}
          onPress={last ? submit : () => setIndex(index + 1)} />
      </View>
    </Screen>
  );
}

// the built-in multiple-choice check-in quiz
export function Checkin({ onDone }) {
  const { t, has, token, lang, c, pop } = useKit();
  const [bank, setBank] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet('/catalog').then(({ data, error: err }) => {
      if (err) setError(errorText(t, has, err));
      else setBank(data.checkinQuiz);
    });
  }, [t, has]);

  async function submit() {
    setBusy(true);
    const { data, error: err } = await apiPost('/learner/checkin', { answers, lang: lang === 'English' ? undefined : lang }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    setResult(data);
    if (onDone) onDone();
  }

  const back = t('m_back');
  if (!bank) return <Screen back={back}>{error ? <Note kind="bad">{error}</Note> : <Text style={{ color: c.inkSoft }}>{t('online_loading')}</Text>}</Screen>;
  if (result) {
    const kind = scoreKind(result.score, result.total);
    return (
      <Screen back={back} title={t('quiz_result_title')}>
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 44, fontWeight: '800', color: c[kind] }}>{result.score}/{result.total}</Text>
          <Text style={{ color: c.ink, fontSize: 18, fontWeight: '800' }}>{t({ good: 'quiz_status_good', warn: 'quiz_status_watch', bad: 'quiz_status_bad' }[kind])}</Text>
          {result.feedback ? <Note><Text style={{ color: c.ink }}><Text style={{ fontWeight: '700' }}>{t('quiz_ai_prefix')}</Text>{result.feedback}</Text></Note> : null}
          {kind !== 'good' ? <Note>{t('quiz_teacher_note')}</Note> : null}
        </Card>
        <Button kind="primary" title={t('m_done')} onPress={pop} />
      </Screen>
    );
  }
  const q = bank[index];
  const last = index === bank.length - 1;
  return (
    <Screen back={back} title={t('quiz_title')}>
      <Text style={{ color: c.inkSoft, marginBottom: 6 }}>{t('quiz_progress', { current: index + 1, total: bank.length })}</Text>
      <Bar pct={(index / bank.length) * 100} color={c.brand} />
      <Text style={{ color: c.ink, fontSize: 21, fontWeight: '800', lineHeight: 28, marginVertical: 18 }}>{t(q.qKey)}</Text>
      {q.optKeys.map((k, i) => {
        const on = answers[index] === i;
        return (
          <Pressable key={k} onPress={() => setAnswers((a) => { const n = [...a]; n[index] = i; return n; })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 9,
              borderColor: on ? c.brand : c.border, backgroundColor: c.surface }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.brand : c.chip }}>
              <Text style={{ color: on ? '#fff' : c.ink, fontWeight: '800' }}>{'ABCD'[i]}</Text>
            </View>
            <Text style={{ color: c.ink, fontSize: 15, flex: 1 }}>{t(k)}</Text>
          </Pressable>
        );
      })}
      <ErrorText>{error}</ErrorText>
      <Button kind="primary" busy={busy} disabled={answers[index] == null} style={{ marginTop: 6 }}
        title={last ? t('quiz_submit_btn') : t('quiz_next_btn')} onPress={last ? submit : () => setIndex(index + 1)} />
    </Screen>
  );
}

// ---- online classes ----

const STATUS_KIND = { present: 'good', late: 'warn', absent: 'bad' };

export function LearnerOnline() {
  const { t, c } = useKit();
  const state = useData('/learner/online-classes');
  return (
    <Screen title={t('learner_online_title')} sub={t('m_online_sub')} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Card>
        <Loaded state={state}>
          {(data) => data.onlineClasses.length === 0 ? <Empty text={t('learner_online_empty')} /> : data.onlineClasses.map((o, i) => (
            <Row key={o.id} first={i === 0} left={<Avatar icon="videocam" color={o.phase === 'open' ? c.bad : c.brand} size={38} />}
              title={o.title}
              meta={<View style={{ marginTop: 3, gap: 4 }}>
                <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t('online_teacher_meta', { teacher: o.teacherName, class: o.className, time: formatTime(o.startsAt), n: o.durationMin })}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Pill kind={o.phase === 'open' ? 'live' : 'soft'} text={t('online_phase_' + o.phase)} />
                  {o.myStatus ? <Pill kind={STATUS_KIND[o.myStatus]} text={t('learner_online_my_status', { status: t('online_status_' + o.myStatus) })} /> : null}
                </View>
              </View>}
              right={o.phase === 'open' ? <Button small kind="primary" title={o.myStatus ? t('learner_online_rejoin_btn') : t('learner_online_join_btn')} onPress={openWebApp} /> : null} />
          ))}
        </Loaded>
        <Note>{t('m_online_web_note')}</Note>
      </Card>
    </Screen>
  );
}

// ---- question papers ----

export function PapersList({ path, title }) {
  const { t, token, c, showToast } = useKit();
  const state = useData(path);
  const [opening, setOpening] = useState(null);
  async function open(p) {
    setOpening(p.id);
    try { await openPaper(p, token); } catch { showToast(t('m_paper_open_error')); }
    setOpening(null);
  }
  return (
    <Screen title={title} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Card>
        <Loaded state={state}>
          {(data) => data.papers.length === 0 ? <Empty text={t('learner_papers_empty')} /> : data.papers.map((p, i) => (
            <Row key={p.id} first={i === 0} left={<Avatar icon="document-text" color={c.brand} size={38} />}
              title={p.title} meta={[t(p.subjectKey), p.teacherName, p.fileName].filter(Boolean).join(' · ')}
              right={<Button small title={t('paper_view')} busy={opening === p.id} onPress={() => open(p)} />} />
          ))}
        </Loaded>
      </Card>
      <Text style={{ color: c.inkSoft, fontSize: 12, textAlign: 'center' }}>{t('m_paper_hint')}</Text>
    </Screen>
  );
}

export const LearnerPapers = () => {
  const { t } = useKit();
  return <PapersList path="/learner/papers" title={t('learner_papers_title')} />;
};

// ---- rating teachers (shown on the learner's profile) ----

export function RateTeachers() {
  const { t, has, token, c, showToast } = useKit();
  const state = useData('/learner/teachers');
  const [mine, setMine] = useState({});
  async function rate(teacher, rating) {
    setMine((m) => ({ ...m, [teacher.id]: rating }));
    const { error } = await apiPut(`/learner/teachers/${teacher.id}/rating`, { rating }, token);
    if (error) { showToast(errorText(t, has, error)); state.reload(); return; }
    showToast(t('learner_rate_thanks', { n: rating }));
  }
  return (
    <Card title={t('learner_rate_title')}>
      <Loaded state={state}>
        {(data) => data.teachers.length === 0 ? <Empty text={t('learner_rate_empty')} /> : data.teachers.map((tc, i) => {
          const value = mine[tc.id] ?? tc.myRating ?? 0;
          return (
            <Row key={tc.id} first={i === 0} title={tc.name} meta={tc.subjectKey ? t(tc.subjectKey) : null}>
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => rate(tc, n)} hitSlop={4} accessibilityLabel={`${n} / 5`}>
                    <Icon name={n <= value ? 'star' : 'star-outline'} size={28} color={n <= value ? c.accent : c.inkSoft} />
                  </Pressable>
                ))}
              </View>
            </Row>
          );
        })}
      </Loaded>
    </Card>
  );
}

