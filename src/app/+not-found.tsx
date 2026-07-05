import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle } from 'lucide-react-native';
import { F } from '@/lib/fonts';

export default function NotFound() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFF' }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
        <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: '#FCE8E6', alignItems: 'center', justifyContent: 'center' }}>
          <AlertCircle size={40} color="#EA4335" strokeWidth={1.5} />
        </View>
        <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#111827', textAlign: 'center' }}>
          Page Not Found
        </Text>
        <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
          This page doesn't exist or may have been moved.
        </Text>
        <Pressable
          onPress={() => router.replace('/')}
          style={{ backgroundColor: '#0078ff', paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>Go Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
