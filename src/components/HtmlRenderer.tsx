/**
 * HtmlRenderer — pure React Native HTML renderer.
 * Parses the controlled HTML we store in Supabase and renders native RN components.
 * No WebView, no native modules — zero crash risk on any platform.
 */
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  html: string;
  updatedAt?: string;
}

/* ─── tiny node type ──────────────────────────────────────────────────────── */
type Node =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; parts: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'tagline'; text: string }
  | { type: 'hero'; html: string }
  | { type: 'raw'; html: string };

type Inline = { text: string; bold?: boolean; color?: string };

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function parseInline(html: string): Inline[] {
  const parts: Inline[] = [];
  // Split on <strong> / <b> tags
  const re = /<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) parts.push({ text: stripTags(html.slice(last, m.index)) });
    parts.push({ text: stripTags(m[2]), bold: true });
    last = m.index + m[0].length;
  }
  if (last < html.length) parts.push({ text: stripTags(html.slice(last)) });
  return parts.filter(p => p.text.length > 0);
}

function parseHtml(raw: string): Node[] {
  // Strip outer wrapper div
  const body = raw.replace(/^<div[^>]*>/, '').replace(/<\/div>\s*$/, '').trim();
  const nodes: Node[] = [];

  // Detect hero block (has gradient background style)
  const heroMatch = body.match(/<div[^>]*background[^>]*linear-gradient[\s\S]*?<\/div>\s*<\/div>/i);
  if (heroMatch) {
    nodes.push({ type: 'hero', html: heroMatch[0] });
  }

  // Split into top-level block elements
  const blockRe = /<(h[123]|p|ul|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];

    if (tag === 'h1') nodes.push({ type: 'h1', text: stripTags(inner) });
    else if (tag === 'h2') nodes.push({ type: 'h2', text: stripTags(inner) });
    else if (tag === 'h3') nodes.push({ type: 'h3', text: stripTags(inner) });
    else if (tag === 'p') {
      // Detect closing tagline (centered, blue, bold)
      if (/text-align:\s*center/i.test(m[0]) && /color:#?1A56DB/i.test(m[0])) {
        nodes.push({ type: 'tagline', text: stripTags(inner) });
      } else {
        const parts = parseInline(inner);
        if (parts.length) nodes.push({ type: 'p', parts });
      }
    } else if (tag === 'ul') {
      const items: Inline[][] = [];
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(inner)) !== null) {
        const parts = parseInline(li[1]);
        if (parts.length) items.push(parts);
      }
      if (items.length) nodes.push({ type: 'ul', items });
    }
  }

  return nodes;
}

/* ─── inline text renderer ───────────────────────────────────────────────── */
function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <Text style={s.body}>
      {parts.map((p, i) => (
        <Text key={i} style={[p.bold && s.bold]}>{p.text}</Text>
      ))}
    </Text>
  );
}

/* ─── Hero block (About Us) — rendered with brand colours ────────────────── */
function HeroBlock() {
  return (
    <View style={s.hero}>
      <View style={s.heroCircle}>
        <Text style={{ fontSize: 34 }}>⚖️</Text>
      </View>
      <Text style={s.heroTitle}>AdvoCal</Text>
      <Text style={s.heroSub}>LEGAL CALENDAR PLATFORM</Text>
      <View style={s.heroPill}>
        <Text style={s.heroPillText}>Your Legal Day, Simplified.</Text>
      </View>
    </View>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */
export default function HtmlRenderer({ html, updatedAt }: Props) {
  const isAboutUs = html.includes('linear-gradient');
  const nodes = parseHtml(html);
  const contentPadding = isAboutUs ? 0 : 0;

  return (
    <View style={[s.container, { paddingTop: contentPadding }]}>
      {updatedAt && !isAboutUs && (
        <Text style={s.timestamp}>
          Last updated: {new Date(updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
      )}

      {isAboutUs && <HeroBlock />}

      <View style={isAboutUs ? s.bodyPad : undefined}>
        {nodes.map((node, i) => {
          if (node.type === 'hero' || node.type === 'raw') return null;

          if (node.type === 'h1') return <Text key={i} style={s.h1}>{node.text}</Text>;
          if (node.type === 'h2') return <Text key={i} style={s.h2}>{node.text}</Text>;
          if (node.type === 'h3') return <Text key={i} style={s.h3}>{node.text}</Text>;
          if (node.type === 'tagline') return (
            <Text key={i} style={s.tagline}>{node.text}</Text>
          );
          if (node.type === 'p') return <InlineText key={i} parts={node.parts} />;
          if (node.type === 'ul') return (
            <View key={i} style={s.ul}>
              {node.items.map((parts, j) => (
                <View key={j} style={s.liRow}>
                  <Text style={s.bullet}>{'\u2022'}</Text>
                  <Text style={[s.body, s.liText]}>
                    {parts.map((p, k) => (
                      <Text key={k} style={p.bold ? s.bold : undefined}>{p.text}</Text>
                    ))}
                  </Text>
                </View>
              ))}
            </View>
          );
          return null;
        })}

        {/* Feature cards for About Us */}
        {isAboutUs && (
          <>
            {[
              { icon: '📅', label: 'Legal Calendar Management' },
              { icon: '🔔', label: 'Hearing Date Tracking & Reminders' },
              { icon: '📊', label: 'Case Management Dashboard' },
              { icon: '👥', label: 'Client & Case Record Organization' },
              { icon: '🏛️', label: 'Court Schedule Monitoring' },
              { icon: '☁️', label: 'Secure Cloud-Based Access' },
              { icon: '📱', label: 'Mobile-Friendly Experience' },
            ].map((f, i) => (
              <View key={i} style={s.featureCard}>
                <Text style={s.featureIcon}>{f.icon}</Text>
                <Text style={s.featureLabel}>{f.label}</Text>
              </View>
            ))}
            <View style={s.footerCard}>
              <Text style={{ fontSize: 20, marginBottom: 6 }}>⚖️</Text>
              <Text style={s.footerTitle}>AdvoCal</Text>
              <Text style={s.footerSub}>Your Legal Day, Simplified.</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  container:   { padding: 20, paddingBottom: 60, backgroundColor: '#FFFFFF' },
  timestamp:   { fontSize: 9, color: '#D1D5DB', marginBottom: 14, letterSpacing: 0.2 },
  h1:          { fontSize: 26, fontWeight: '800', color: '#0D1A3A', marginBottom: 6, lineHeight: 34 },
  h2:          { fontSize: 18, fontWeight: '700', color: '#0078ff', marginBottom: 8, marginTop: 4, lineHeight: 26 },
  h3:          { fontSize: 16, fontWeight: '800', color: '#0D1A3A', marginTop: 20, marginBottom: 10, lineHeight: 24 },
  body:        { fontSize: 15, fontWeight: '400', color: '#374151', lineHeight: 27, marginBottom: 14 },
  bold:        { fontWeight: '700', color: '#111827' },
  ul:          { marginBottom: 16 },
  liRow:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet:      { fontSize: 15, color: '#374151', marginRight: 10, marginTop: 2, lineHeight: 24 },
  liText:      { flex: 1, marginBottom: 0 },
  tagline:     { fontSize: 15, fontWeight: '700', color: '#0078ff', textAlign: 'center', marginTop: 24, marginBottom: 8 },
  // Hero
  hero:        { backgroundColor: '#0D1A3A', padding: 32, alignItems: 'center', marginHorizontal: -20, marginTop: -20, marginBottom: 0 },
  heroCircle:  { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle:   { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, marginBottom: 4 },
  heroSub:     { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5, marginBottom: 14 },
  heroPill:    { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6 },
  heroPillText:{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  bodyPad:     { paddingTop: 24 },
  // Feature cards
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F0F5FF', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#0078ff' },
  featureIcon: { fontSize: 22 },
  featureLabel:{ fontSize: 14, fontWeight: '700', color: '#0D1A3A', flex: 1 },
  footerCard:  { backgroundColor: '#0D1A3A', borderRadius: 14, padding: 20, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  footerTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  footerSub:   { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
});
