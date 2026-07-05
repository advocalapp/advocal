/**
 * LegalContentScreen
 * Generic in-app reader for all legal / policy pages.
 * Loaded via: router.push('/(app)/legal-content?id=about_us')
 * Content is HTML (saved by the admin rich text editor) — rendered via HtmlRenderer DOM component.
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { F } from '@/lib/fonts';
import HtmlRenderer from '@/components/HtmlRenderer';

interface LegalPage {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

export default function LegalContentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage]       = useState<LegalPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!id) { setError('Page not found.'); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase
        .from('legal_pages')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (err) setError('Could not load content. Please try again.');
      else if (!data) setError('Page not found.');
      else setPage(data as LegalPage);
      setLoading(false);
    })();
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: '#F0F2F5',
        }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={18} color="#374151" strokeWidth={2} />
          </Pressable>
          <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#0D1A3A', flex: 1 }} numberOfLines={1}>
            {page?.title ?? (loading ? '' : 'Legal')}
          </Text>
        </View>

        {/* Body */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#0078ff" />
          </View>
        ) : error ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 14, fontFamily: F.medium, color: '#9CA3AF', textAlign: 'center' }}>{error}</Text>
          </View>
        ) : (
          /* ScrollView wrapping DOM component — matchContents expands webview to
             full content height so native ScrollView handles all scrolling */
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            <HtmlRenderer
              html={page?.content ?? ''}
              updatedAt={page?.updated_at}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
