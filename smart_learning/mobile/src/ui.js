// The building blocks every screen uses, in the look of the mobile prototype.
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from './AppContext';
import { useI18n } from './i18n';
import { useTheme, tint } from './theme';
import { useLoad } from './api';

// everything a screen usually needs, in one call
export function useKit() {
  const app = useApp();
  const i18n = useI18n();
  const c = useTheme();
  return { ...app, ...i18n, c };
}

// GET `path` with the logged-in token: { data, error, loading, reload }
export function useData(path) {
  const { token, t, has } = useKit();
  return useLoad(path, token, t, has);
}

export const Icon = ({ name, size = 20, color }) => {
  const c = useTheme();
  return <Ionicons name={name} size={size} color={color || c.ink} />;
};

export function initials(name = '') {
  return name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '');
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---- layout ----

// A scrolling page with a big title. `onRefresh` adds pull-to-refresh.
export function Screen({ title, sub, right, back, onRefresh, refreshing = false, children, scroll = true }) {
  const { c, pop } = useKit();
  const insets = useSafeAreaInsets();
  // every page has the log-out button at the top right: on the title row, or on the back row
  // of a page without a title
  const head = (
    <View style={{ paddingTop: insets.top + 6 }}>
      {back && (
        <View style={styles.backRow}>
          <Pressable onPress={pop} hitSlop={10} style={styles.back}>
            <Icon name="chevron-back" size={18} color={c.brand} />
            <Text style={{ color: c.brand, fontWeight: '600', fontSize: 15 }}>{back}</Text>
          </Pressable>
          {title ? null : <LogoutButton />}
        </View>
      )}
      {title ? (
        <View style={styles.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">{title}</Text>
            {sub ? <Text style={{ color: c.inkSoft, fontSize: 13, marginTop: 2 }}>{sub}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {right}
            <LogoutButton />
          </View>
        </View>
      ) : null}
    </View>
  );
  if (!scroll) return <View style={{ flex: 1, paddingHorizontal: 16 }}>{head}{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}
    >
      {head}
      {children}
    </ScrollView>
  );
}

export function Card({ title, aside, children, style, accent }) {
  const { c } = useKit();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: accent || c.border }, style]}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: c.ink }]}>{title}</Text>
          {typeof aside === 'string'
            ? <Text style={{ color: c.inkSoft, fontSize: 12, flexShrink: 1, textAlign: 'right' }}>{aside}</Text>
            : aside || null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// the navy banner with a gold glow, e.g. the learner's progress (the same look as the login)
export function Hero({ children }) {
  const { c } = useKit();
  return (
    <View style={[styles.hero, { backgroundColor: c.brandInk }]}>
      <View style={styles.heroCircle} />
      {children}
    </View>
  );
}

export function Row({ left, title, meta, right, onPress, first, children }) {
  const { c } = useKit();
  const body = (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15 }}>{title}</Text> : null}
        {meta ? (typeof meta === 'string' ? <Text style={{ color: c.inkSoft, fontSize: 12.5, marginTop: 2 }}>{meta}</Text> : meta) : null}
        {children}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} android_ripple={{ color: c.chip }}>{body}</Pressable> : body;
}

// ---- small pieces ----

export function Pill({ kind = 'soft', text }) {
  const { c } = useKit();
  const color = { good: c.good, warn: c.warn, bad: c.bad, live: '#ffffff', soft: c.inkSoft, brand: c.brand }[kind];
  const bg = kind === 'live' ? c.bad : kind === 'soft' ? c.chip : tint(color, 0.15);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// on_track / watch / at_risk as a coloured pill
export function StatusPill({ status }) {
  const { t } = useKit();
  if (!status) return <Pill text={t('teacher_status_none')} />;
  const kind = { on_track: 'good', watch: 'warn', at_risk: 'bad' }[status];
  const text = t('status_' + status);
  return <Pill kind={kind} text={text.charAt(0).toUpperCase() + text.slice(1)} />;
}

export function scoreKind(score, total) {
  const pct = total ? score / total : 0;
  return pct >= 0.8 ? 'good' : pct >= 0.5 ? 'warn' : 'bad';
}

export function Button({ title, onPress, kind = 'plain', small, disabled, busy, icon, style }) {
  const { c } = useKit();
  const bg = { primary: c.brand, plain: c.chip, danger: tint(c.bad, 0.14), role: null }[kind];
  const fg = kind === 'primary' ? c.onBrand : kind === 'danger' ? c.bad : c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} size="small" /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {icon ? <Icon name={icon} size={small ? 15 : 18} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, dot, label }) {
  const { c } = useKit();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}
      style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Icon name={name} size={20} />
      {dot ? <View style={[styles.dot, { backgroundColor: c.bad, borderColor: c.surface }]} /> : null}
    </Pressable>
  );
}

// a round-cornered icon or initials, softly tinted in `color` (gold unless it means something)
// Log out, from the top of every page. It asks first, so a stray tap doesn't sign anyone out.
export function LogoutButton() {
  const { t, c, logout } = useKit();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Pressable onPress={() => setAsking(true)} accessibilityLabel={t('logout_button')} hitSlop={6}
        style={[styles.iconBtn, { backgroundColor: tint(c.bad, 0.1), borderColor: tint(c.bad, 0.3) }]}>
        <Icon name="log-out-outline" size={20} color={c.bad} />
      </Pressable>
      <Sheet visible={asking} title={t('logout_button')} onClose={() => setAsking(false)}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: c.ink, fontSize: 16, marginBottom: 16 }}>{t('m_logout_confirm')}</Text>
          <Button kind="danger" icon="log-out-outline" title={t('logout_button')} onPress={() => { setAsking(false); logout(); }} />
          <Button title={t('pw_cancel_btn')} onPress={() => setAsking(false)} style={{ marginTop: 10 }} />
        </View>
      </Sheet>
    </>
  );
}

export function Avatar({ text, icon, color, size = 40 }) {
  const { c } = useKit();
  const fg = color || c.brand;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.33, backgroundColor: tint(fg, 0.16), alignItems: 'center', justifyContent: 'center' }}>
      {icon ? <Ionicons name={icon} size={size * 0.5} color={fg} />
        : <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.34 }}>{text}</Text>}
    </View>
  );
}

export function Bar({ pct, color, height = 7, track }) {
  const { c } = useKit();
  return (
    <View style={{ height, borderRadius: 99, backgroundColor: track || c.chip, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, height: '100%', borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

export function Stat({ n, label, color }) {
  const { c } = useKit();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: color || c.ink }}>{n}</Text>
      <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{label}</Text>
    </View>
  );
}

export const Grid2 = ({ children }) => <View style={styles.grid2}>{children}</View>;

export function Chips({ items, value, onChange }) {
  const { c } = useKit();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable key={String(it.id)} onPress={() => onChange(it.id)}
            style={[styles.chip, { backgroundColor: on ? c.ink : c.surface, borderColor: on ? c.ink : c.border }]}>
            <Text style={{ color: on ? c.bg : c.ink, fontWeight: '600', fontSize: 13 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Field({ label, hint, style, multiline, ...input }) {
  const { c } = useKit();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13, marginBottom: 5 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.inkSoft}
        multiline={multiline}
        style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.ink }, multiline && { minHeight: 80, textAlignVertical: 'top' }, style]}
        {...input}
      />
      {hint ? <Text style={{ color: c.inkSoft, fontSize: 12, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

export function PasswordField({ label, value, onChangeText, autoComplete = 'password' }) {
  const { c, t } = useKit();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13, marginBottom: 5 }}>{label}</Text>
      <View>
        <TextInput
          value={value} onChangeText={onChangeText} secureTextEntry={!shown} autoCapitalize="none" autoComplete={autoComplete}
          placeholderTextColor={c.inkSoft}
          style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.ink, paddingRight: 46 }]}
        />
        <Pressable onPress={() => setShown((s) => !s)} style={styles.eye} accessibilityLabel={shown ? t('pw_hide') : t('pw_show')}>
          <Icon name={shown ? 'eye-off-outline' : 'eye-outline'} color={c.inkSoft} />
        </Pressable>
      </View>
    </View>
  );
}

// a choice from a short list, shown as a column of options
export function Choice({ label, options, value, onChange }) {
  const { c } = useKit();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13, marginBottom: 5 }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable key={String(o.id)} onPress={() => onChange(o.id)}
              style={[styles.chip, { backgroundColor: on ? c.brand : c.surface, borderColor: on ? c.brand : c.border }]}>
              <Text style={{ color: on ? c.onBrand : c.ink, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// plain text (or several pieces of it) has to sit inside <Text> on a phone
const isText = (x) => typeof x === 'string' || typeof x === 'number' || (Array.isArray(x) && x.every(isText));

export function Note({ children, kind = 'brand' }) {
  const { c } = useKit();
  const color = { brand: c.brand, good: c.good, bad: c.bad }[kind];
  return (
    <View style={[styles.note, { backgroundColor: tint(color, 0.12) }]}>
      {isText(children) ? <Text style={{ color: c.ink, fontSize: 13, lineHeight: 19 }}>{children}</Text> : children}
    </View>
  );
}

export function ErrorText({ children }) {
  const { c } = useKit();
  return children ? <Text style={{ color: c.bad, fontSize: 13, marginBottom: 10 }}>{children}</Text> : null;
}

export function Empty({ text }) {
  const { c } = useKit();
  return <Text style={{ color: c.inkSoft, textAlign: 'center', paddingVertical: 14, fontSize: 13.5 }}>{text}</Text>;
}

export function Loading() {
  const { c } = useKit();
  return <ActivityIndicator style={{ marginVertical: 30 }} color={c.brand} />;
}

// Loading spinner, error, or the content once `data` is there
export function Loaded({ state, children }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error && !state.data) return <Note kind="bad">{state.error}</Note>;
  return state.data ? children(state.data) : null;
}

// a panel that slides up from the bottom
export function Sheet({ visible, title, sub, onClose, children }) {
  const { c } = useKit();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom }]}>
        <View style={[styles.sheetHead, { backgroundColor: c.brandInk }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{title}</Text>
            {sub ? <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={styles.sheetClose}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 14 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800', flexShrink: 1 },
  hero: { borderRadius: 22, padding: 18, marginBottom: 12, overflow: 'hidden' },
  heroCircle: { position: 'absolute', right: -50, top: -60, width: 190, height: 190, borderRadius: 95, backgroundColor: '#b8791f', opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' },
  btn: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 14 },
  grid2: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16 },
  eye: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 8 },
  note: { borderRadius: 14, padding: 12, marginTop: 6, marginBottom: 6 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  sheetClose: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
});
