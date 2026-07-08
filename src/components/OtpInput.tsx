/**
 * OtpInput — 6-box individual TextInput with:
 * - Auto-focus chain (next on digit, prev on backspace)
 * - Paste support (fills all 6 boxes from clipboard)
 * - Spring scale-pulse on active box (RN Animated — web-safe)
 * - textContentType="oneTimeCode" + autoComplete="sms-otp" for SMS auto-fill
 */
import { useRef, useEffect } from 'react';
import { View, TextInput, Animated } from 'react-native';
import { F } from '@/lib/fonts';

interface Props {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  hasError?: boolean;
}

export function OtpInput({ value, onChange, autoFocus = true, hasError = false }: Props) {
  const refs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  useEffect(() => {
    if (autoFocus) {
      const firstEmpty = Math.min(value.length, 5);
      setTimeout(() => refs.current[firstEmpty]?.focus(), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (idx: number, text: string) => {
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = [...digits];
      for (let i = 0; i < clean.length && idx + i < 6; i++) {
        next[idx + i] = clean[i];
      }
      onChange(next.join(''));
      setTimeout(() => refs.current[Math.min(idx + clean.length, 5)]?.focus(), 10);
      return;
    }
    if (!clean) {
      const next = [...digits]; next[idx] = ''; onChange(next.join('')); return;
    }
    const next = [...digits]; next[idx] = clean[0]; onChange(next.join(''));
    if (idx < 5) setTimeout(() => refs.current[idx + 1]?.focus(), 10);
    else refs.current[idx]?.blur();
  };

  const handleKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]; next[idx] = ''; onChange(next.join(''));
      } else if (idx > 0) {
        const next = [...digits]; next[idx - 1] = ''; onChange(next.join(''));
        setTimeout(() => refs.current[idx - 1]?.focus(), 10);
      }
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 2 }}>
      {digits.map((d, i) => (
        <OtpBox
          key={i}
          refFn={(r) => { refs.current[i] = r; }}
          digit={d}
          isActive={i === value.length && i < 6}
          isFilled={!!d}
          isError={hasError && value.length === 6}
          onChangeText={(t) => handleChange(i, t)}
          onKeyPress={(k) => handleKeyPress(i, k)}
        />
      ))}
    </View>
  );
}

// ── Single animated OTP box (RN Animated — web + native safe) ─────────────────
function OtpBox({
  refFn, digit, isActive, isFilled, isError, onChangeText, onKeyPress,
}: {
  refFn: (r: TextInput | null) => void;
  digit: string; isActive: boolean; isFilled: boolean; isError: boolean;
  onChangeText: (t: string) => void; onKeyPress: (k: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isActive ? 1.07 : 1,
      damping: 12, stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [isActive, scale]);

  const borderColor = isError ? '#dc2626' : (isFilled || isActive) ? '#0078ff' : '#d1d5db';
  const bgColor     = isError ? '#fef2f2' : isFilled ? '#eff6ff' : '#f9fafb';

  return (
    <Animated.View style={{
      flex: 1, minWidth: 0, height: 58, borderRadius: 14,
      borderWidth: isActive || isFilled ? 2 : 1.5,
      borderColor, backgroundColor: bgColor,
      alignItems: 'center', justifyContent: 'center',
      transform: [{ scale }],
    }}>
      <TextInput
        ref={refFn}
        value={digit}
        onChangeText={onChangeText}
        onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key)}
        keyboardType="number-pad"
        maxLength={6}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        selectTextOnFocus
        style={{
          width: '100%', height: '100%', textAlign: 'center',
          fontSize: 22, fontFamily: F.bold,
          color: isError ? '#dc2626' : '#111827',
          outlineWidth: 0,
        } as any}
      />
    </Animated.View>
  );
}
