// The parent's app: only the children the school administrator linked to them.
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Bar, Card, Chips, Empty, Hero, Loaded, Note, Pill, Row, Screen, StatusPill, formatTime, scoreKind, useData, useKit,
} from '../ui';
import { HeaderButtons } from './Common';

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
                  <Card title={t('learner_lessons_title')}>
                    {d.lessons.map((l, i) => (
                      <Row key={l.id} first={i === 0} title={t(l.key)}
                        meta={<Bar pct={l.progress} color={l.done ? c.good : c.brand} />}
                        right={l.done ? <Pill kind="good" text={t('learner_completed')} /> : <Text style={{ color: c.inkSoft }}>{l.progress}%</Text>} />
                    ))}
                  </Card>
                  {d.checkin ? (
                    <Note>{t('quiz_title')}: {t('quiz_score_caption', { correct: d.checkin.score, total: d.checkin.total })}</Note>
                  ) : null}
                </View>
              )}
            </Loaded>
          </View>
        )}
      </Loaded>
    </Screen>
  );
}
