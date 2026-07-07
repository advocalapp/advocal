/**
 * OtpInput — 6-box individual TextInput with:
 * - Auto-focus chain (next on digit, prev on backspace)
 * - Paste support (fills all 6 boxes from clipboard)
 * - Animated active-box scale pulse
 * - textContentType="oneTimeCode" + autoComplete="sms-otp" for SMS auto-fill
 */
import { useRef, useEffect } from 'react';
import { View, TextInput } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { F } from '@/lib/fonts';

interface Props {
  value: string;           // 0–6 digit string
  onChange: (v: string) => void;
  autoFocus?: boolean;
  hasError?: boolean;
}

export function OtpInput({ value, onChange, autoFocus = true, hasError = false }: Props) {
  const refs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  // Focus first empty box when autoFocus requested
  useEffect(() => {
    if (autoFocus) {
      const firstEmpty = Math.min(value.length, 5);
      setTimeout(() => refs.current[firstEmpty]?.focus(), 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (idx: number, text: string) => {
    // Paste: if more than 1 char, fill from this index onwards
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = [...digits];
      for (let i = 0; i < clean.length && idx + i < 6; i++) {
        next[idx + i] = clean[i];
      }
      const joined = next.join('');
      onChange(joined);
      const focusIdx = Math.min(idx + clean.length, 5);
      setTimeout(() => refs.current[focusIdx]?.focus(), 10);
      return;
    }
    if (!clean) {
      // Empty — clear this box
      const next = [...digits];
      next[idx] = '';
      onChange(next.join(''));
      return;
    }
    const next = [...digits];
    next[idx] = clean[0];
    onChange(next.join(''));
    if (idx < 5) {
      setTimeout(() => refs.current[idx + 1]?.focus(), 10);
    } else {
      refs.current[idx]?.blur();
    }
  };

  const handleKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace') {
      if (digits[idx]) {
        // Clear current box
        const next = [...digits];
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        // Move to previous and clear it
        const next = [...digits];
        next[idx - 1] = '';
        onChange(next.join(''));
        setTimeout(() => refs.current[idx - 1]?.focus(), 10);
      }
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 2 }}>
      {digits.map((d, i) => {
        const isActive = i === value.length && i < 6;
        const isFilled = !!d;
        const isError = hasError && value.length === 6;
        return (
          <OtpBox
            key={i}
            refFn={(r) => { refs.current[i] = r; }}
            digit={d}
            isActive={isActive}
            isFilled={isFilled}
            isError={isError}
            onChangeText={(t) => handleChange(i, t)}
            onKeyPress={(k) => handleKeyPress(i, k)}
          />
        );
      })}
    </View>
  );
}

// ── Single animated OTP box ───────────────────────────────────────────────────
function OtpBox({
  refFn, digit, isActive, isFilled, isError,
  onChangeText, onKeyPress,
}: {
  refFn: (r: TextInput | null) => void;
  digit: string;
  isActive: boolean;
  isFilled: boolean;
  isError: boolean;
  onChangeText: (t: string) => void;
  onKeyPress: (k: string) => void;
}) {
  const scale = useSharedValue(1);
  const borderAnim = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    borderAnim.value = withTiming(isActive ? 1 : 0, { duration: 150 });
    if (isActive) scale.value = withSpring(1.06, { damping: 12 });
    else scale.value = withSpring(1, { damping: 12 });
  }, [isActive, borderAnim, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const borderColor = isError
    ? '#dc2626'
    : isFilled
      ? '#0078ff'
      : isActive
        ? '#0078ff'
        : '#d1d5db';

  const bgColor = isError
    ? '#fef2f2'
    : isFilled
      ? '#eff6ff'
      : '#f9fafb';

  return (
    <Animated.View
      style={[
        animStyle,
        {
          flex: 1,
          minWidth: 0,
          height: 58,
          borderRadius: 14,
          borderWidth: isActive || isFilled ? 2 : 1.5,
          borderColor,
          backgroundColor: bgColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <TextInput
        ref={refFn}
        value={digit}
        onChangeText={onChangeText}
        onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key)}
        keyboardType="number-pad"
        maxLength={6}  // allow paste of 6 digits
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        selectTextOnFocus
        style={{
          width: '100%',
          height: '100%',
          textAlign: 'center',
          fontSize: 22,
          fontFamily: F.bold,
          color: isError ? '#dc2626' : '#111827',
          // suppress web outline
          outlineWidth: 0,
        } as any}
      />
    </Animated.View>
  );
}
