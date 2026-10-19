// Smart Learning on the phone: the same school system as the website, built from the mobile
// prototype. Each role gets its own tabs; everything comes from the Smart Learning backend.
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider } from './src/AppContext';
import { I18nProvider } from './src/i18n';
import { useKit } from './src/ui';
import { FirstLogin, Forgot, Login } from './src/screens/Auth';
import { ChatSheet, NotificationsScreen, ProfileScreen } from './src/screens/Common';
import { Checkin, LearnerHome, LearnerOnline, LearnerPapers, LearnerQuizzes, QuizTake, RateTeachers } from './src/screens/Learner';
import { PaperQuiz, QuizBuilder, QuizResults, Register, TeacherClass, TeacherOnline, TeacherPapers, TeacherQuizzes } from './src/screens/Teacher';
import { ParentChild } from './src/screens/Parent';
import { HodDepartment, HodReports, PrincipalReports, PrincipalTeachers } from './src/screens/Staff';
import { AdminClasses, AdminOverview, AdminSms, AdminUsers } from './src/screens/Admin';

const LearnerProfile = () => <ProfileScreen extra={<RateTeachers />} />;

// [tab id, icon, label key, screen]
const TABS = {
  learner: [
    ['home', 'home', 'nav_overview', LearnerHome], ['quizzes', 'document-text', 'nav_quizzes', LearnerQuizzes],
    ['online', 'videocam', 'nav_online_classes', LearnerOnline], ['papers', 'folder-open', 'nav_papers', LearnerPapers],
    ['me', 'person', 'm_tab_me', LearnerProfile],
  ],
  teacher: [
    ['class', 'people', 'nav_my_class', TeacherClass], ['tquizzes', 'document-text', 'nav_quizzes', TeacherQuizzes],
    ['tonline', 'videocam', 'nav_online_classes', TeacherOnline], ['tpapers', 'folder-open', 'nav_papers', TeacherPapers],
    ['me', 'person', 'm_tab_me', ProfileScreen],
  ],
  parent: [
    ['child', 'stats-chart', 'parent_progress_title', ParentChild], ['alerts', 'notifications', 'parent_notifications_title', NotificationsScreen],
    ['me', 'person', 'm_tab_me', ProfileScreen],
  ],
  hod: [
    ['dept', 'business', 'hod_dept_title', HodDepartment], ['hreports', 'document', 'hod_report_title', HodReports],
    ['me', 'person', 'm_tab_me', ProfileScreen],
  ],
  principal: [
    ['pteachers', 'school', 'principal_teachers_title', PrincipalTeachers], ['preports', 'document', 'principal_reports_title', PrincipalReports],
    ['me', 'person', 'm_tab_me', ProfileScreen],
  ],
  admin: [
    ['aover', 'business', 'nav_overview', AdminOverview], ['ausers', 'people', 'nav_users', AdminUsers],
    ['aclasses', 'school', 'nav_classes', AdminClasses], ['asms', 'chatbox', 'm_sms_tab', AdminSms],
    ['me', 'person', 'm_tab_me', ProfileScreen],
  ],
};

// screens opened on top of a tab
const ROUTES = { quiz: QuizTake, checkin: Checkin, quizBuilder: QuizBuilder, quizResults: QuizResults, paperQuiz: PaperQuiz, register: Register };

function Signed() {
  const { user, tab, switchTab, stack, pop, toast, t, c } = useKit();
  const insets = useSafeAreaInsets();
  const [chatOpen, setChatOpen] = useState(false);
  const tabs = TABS[user.role];
  const current = tabs.find(([id]) => id === tab) || tabs[0];
  const top = stack[stack.length - 1];

  // Android's back button closes the screen on top, then goes back to the first tab
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) { pop(); return true; }
      if (current[0] !== tabs[0][0]) { switchTab(tabs[0][0]); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack, current, tabs, pop, switchTab]);

  const Page = top ? ROUTES[top.name] : current[3];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Page key={top ? top.name + stack.length : current[0]} {...(top ? top.params : {})} />

      {!top ? (
        <Pressable onPress={() => setChatOpen(true)} accessibilityLabel={t('chat_title')}
          style={[styles.fab, { backgroundColor: c.brand, bottom: 76 + insets.bottom }]}>
          <Ionicons name="chatbubble-ellipses" size={25} color="#fff" />
        </Pressable>
      ) : null}

      <View style={[styles.tabs, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {tabs.map(([id, icon, label]) => {
          const on = id === current[0] && !top;
          return (
            <Pressable key={id} onPress={() => switchTab(id)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Ionicons name={on ? icon : icon + '-outline'} size={23} color={on ? c.brand : c.inkSoft} />
              <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '600', color: on ? c.brand : c.inkSoft }}>{t(label)}</Text>
            </Pressable>
          );
        })}
      </View>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { backgroundColor: c.ink, bottom: 90 + insets.bottom }]}>
          <Ionicons name="checkmark-circle" size={18} color={c.good} />
          <Text style={{ color: c.bg, fontWeight: '600', flex: 1 }}>{toast}</Text>
        </View>
      ) : null}

      <ChatSheet visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}

function Root() {
  const { session, pending, restoring, c } = useKit();
  const [screen, setScreen] = useState('login'); // before logging in: 'login' | 'forgot'

  if (restoring) {
    return <View style={{ flex: 1, backgroundColor: c.brandInk, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#f2b25a" size="large" /></View>;
  }
  if (session) return <Signed />;
  if (pending) return <FirstLogin />;
  if (screen === 'forgot') return <Forgot onBack={() => setScreen('login')} />;
  return <Login onForgot={() => setScreen('forgot')} />;
}

function Themed() {
  const { c, session } = useKit();
  // light text on the dark welcome and login headers, otherwise to suit the theme
  return <StatusBar style={!session || c.dark ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AppProvider>
          <Themed />
          <Root />
        </AppProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  fab: { position: 'absolute', right: 16, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#b8791f', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 14 },
});
