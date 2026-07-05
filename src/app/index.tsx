import { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { F } from '@/lib/fonts';

const BG_URL   = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Spash.png';
const LOGO_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Homelogo.png';
const BRAND    = '#0078ff';

const SLIDES = [
  {
    id:       '1',
    title:    'Welcome to AdvoCal',
    subtitle: 'Your Legal Day, Simplified.',
    body:     'Manage hearings, organize cases, and stay one step ahead with a calendar built exclusively for advocates.',
  },
  {
    id:       '2',
    title:    'Never Miss a Hearing',
    subtitle: '',
    body:     'Track court dates, receive timely reminders, and keep every case organized in one secure place.',
  },
  {
    id:       '3',
    title:    'Built for Indian Advocates',
    subtitle: '',
    body:     'From daily hearings to long-term case management, AdvoCal helps you stay organized so you can focus on winning cases.',
  },
];

export default function WelcomeScreen() {
  const router             = useRouter();
  const [idx, setIdx]      = useState(0);
  const [btnPressed, setBtn] = useState(false);
  const fadeAnim           = useRef(new Animated.Value(1)).current;

  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  // Fade out → swap content → fade in on slide change
  const goNext = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      if (idx < SLIDES.length - 1) {
        setIdx(idx + 1);
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      } else {
        router.replace('/(auth)/sign-in');
      }
    });
  };

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar style="dark" backgroundColor="transparent" translucent />

      {/* Full-screen background — covers all device sizes, anchored to top */}
      <Image
        source={{ uri: BG_URL }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        contentPosition="top"
        cachePolicy="memory-disk"
      />

      {/* Animated text content — sits in white upper half, fades between slides */}
      <Animated.View
        style={{
          position:   'absolute',
          top:        '7%',
          left:       24,
          right:      24,
          alignItems: 'center',
          gap:        10,
          opacity:    fadeAnim,
        }}
      >
        {/* Logo */}
        <Image
          source={{ uri: LOGO_URL }}
          style={{ width: 88, height: 88, borderRadius: 22, marginBottom: 4 }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />

        {/* Title */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{
            fontSize:      22,
            fontFamily:    F.extraBold,
            color:         BRAND,
            textAlign:     'center',
            letterSpacing: 0.1,
            alignSelf:     'stretch',
          }}
        >
          {slide.title}
        </Text>

        {/* Subtitle chip — slide 1 only */}
        {slide.subtitle ? (
          <View style={{
            backgroundColor:   'rgba(0,120,255,0.10)',
            borderRadius:      50,
            borderWidth:       1,
            borderColor:       'rgba(0,120,255,0.22)',
            paddingHorizontal: 14,
            paddingVertical:   5,
            alignSelf:         'center',
          }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ fontSize: 14, fontFamily: F.semiBold, color: BRAND, textAlign: 'center' }}
            >
              {slide.subtitle}
            </Text>
          </View>
        ) : null}

        {/* Body */}
        <Text style={{
          fontSize:   13.5,
          fontFamily: F.bold,
          color:      '#334155',
          textAlign:  'center',
          lineHeight: 21,
          alignSelf:  'stretch',
          marginTop:  4,
        }}>
          {slide.body}
        </Text>
      </Animated.View>

      {/* Bottom controls — in normal layout flow inside SafeAreaView */}
      <SafeAreaView
        edges={['bottom']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
      >
        <View style={{ paddingHorizontal: 32, paddingBottom: 28, paddingTop: 8, alignItems: 'center' }}>

          {/* Dot indicators */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width:           i === idx ? 20 : 7,
                  height:          7,
                  borderRadius:    4,
                  backgroundColor: i === idx ? '#ffffff' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </View>

          {/* Next / Get Started button */}
          <Pressable
            onPress={goNext}
            onPressIn={() => setBtn(true)}
            onPressOut={() => setBtn(false)}
            style={{
              backgroundColor:   btnPressed ? 'rgba(255,255,255,0.88)' : '#ffffff',
              paddingVertical:   13,
              paddingHorizontal: 44,
              borderRadius:      50,
              flexDirection:     'row',
              alignItems:        'center',
              justifyContent:    'center',
              gap:               6,
              minWidth:          160,
            }}
          >
            <Text style={{ color: BRAND, fontSize: 15, fontFamily: F.extraBold, letterSpacing: 0.2 }}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
            <Text style={{ color: BRAND, fontSize: 15, fontFamily: F.extraBold }}>→</Text>
          </Pressable>

        </View>
      </SafeAreaView>
    </View>
  );
}
