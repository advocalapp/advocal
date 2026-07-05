import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { ChevronUp, ChevronDown, Clock, X } from 'lucide-react-native';
import { F } from '@/lib/fonts';

/**
 * TimePickerField — compact single-line trigger that opens a modal popup.
 * value / onChange use "HH:MM" 24-hour strings (e.g. "09:30").
 * Pass value="" to mean "not set".
 */
interface Props {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

export function TimePickerField({ label = 'Hearing Time', value, onChange }: Props) {
  const parsed = (() => {
    if (!value || !value.includes(':')) return null;
    const [h, m] = value.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return { h, m };
  })();

  const [open,    setOpen]    = useState(false);
  const [hours,   setHours]   = useState(parsed?.h ?? 10);
  const [minutes, setMinutes] = useState(parsed?.m ?? 0);

  const displayTime = parsed
    ? (() => {
        const h12 = parsed.h === 0 ? 12 : parsed.h > 12 ? parsed.h - 12 : parsed.h;
        const ampm = parsed.h < 12 ? 'AM' : 'PM';
        return `${pad(h12)}:${pad(parsed.m)} ${ampm}`;
      })()
    : null;

  const changeHours = (delta: number) => {
    setHours(prev => (prev + delta + 24) % 24);
  };

  const changeMinutes = (delta: number) => {
    setMinutes(prev => {
      let next = prev + delta;
      if (next >= 60) { next = 0;  setHours(h => (h + 1) % 24); }
      if (next < 0)   { next = 55; setHours(h => (h - 1 + 24) % 24); }
      return next;
    });
  };

  const handleDone = () => {
    onChange(`${pad(hours)}:${pad(minutes)}`);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setHours(10);
    setMinutes(0);
    setOpen(false);
  };

  const ampm = hours < 12 ? 'AM' : 'PM';
  const h12  = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  const Stepper = ({ val, onUp, onDown, unit }: { val: number; onUp: () => void; onDown: () => void; unit: string }) => (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 10, fontFamily: F.semiBold, color: '#9ca3af', letterSpacing: 0.5 }}>{unit}</Text>
      <Pressable onPress={onUp} hitSlop={10}
        style={{ width: 40, height: 30, alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#e8f0fe', borderRadius: 8 }}>
        <ChevronUp size={14} color="#0058bd" strokeWidth={2.5} />
      </Pressable>
      <View style={{
        width: 60, height: 50, borderRadius: 10,
        backgroundColor: '#f0f5ff', borderWidth: 2, borderColor: '#0058bd',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#0058bd', letterSpacing: 1 }}>
          {pad(val)}
        </Text>
      </View>
      <Pressable onPress={onDown} hitSlop={10}
        style={{ width: 40, height: 30, alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#e8f0fe', borderRadius: 8 }}>
        <ChevronDown size={14} color="#0058bd" strokeWidth={2.5} />
      </Pressable>
    </View>
  );

  return (
    <>
      {/* ── Compact trigger row ── */}
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
          {label}
        </Text>
        <Pressable
          onPress={() => setOpen(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#f6faff', borderRadius: 10,
            borderWidth: 1.5, borderColor: displayTime ? '#0058bd' : '#dee3e8',
            paddingHorizontal: 11, paddingVertical: 11,
          }}
        >
          <Clock size={14} color={displayTime ? '#0058bd' : '#9ca3af'} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 12.5, fontFamily: displayTime ? F.bold : F.regular,
            color: displayTime ? '#171c20' : '#9ca3af' }} numberOfLines={1}>
            {displayTime ?? 'Time'}
          </Text>
          {displayTime
            ? <Pressable hitSlop={8} onPress={handleClear}>
                <X size={12} color="#9ca3af" strokeWidth={2.5} />
              </Pressable>
            : <ChevronDown size={12} color="#9ca3af" strokeWidth={2} />}
        </Pressable>
      </View>

      {/* ── Popup modal ── */}
      <Modal visible={open} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor: '#fff', borderRadius: 24, padding: 28,
              width: 280, alignItems: 'center',
              boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,0,0,0.18)' }],
            }}
          >
            {/* Title */}
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', marginBottom: 20 }}>
              Select Hearing Time
            </Text>

            {/* Steppers */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Stepper val={hours}   unit="HH" onUp={() => changeHours(1)}   onDown={() => changeHours(-1)} />
              <Text style={{ fontSize: 28, fontFamily: F.bold, color: '#0058bd', marginTop: 16 }}>:</Text>
              <Stepper val={minutes} unit="MM" onUp={() => changeMinutes(5)} onDown={() => changeMinutes(-5)} />
              {/* AM/PM */}
              <View style={{ marginTop: 16, backgroundColor: '#e8f0fe', borderRadius: 10,
                paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0058bd' }}>{ampm}</Text>
                <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#0058bd', marginTop: 2 }}>
                  {h12}:{pad(minutes)}
                </Text>
              </View>
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, width: '100%' }}>
              <Pressable
                onPress={() => setOpen(false)}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 12,
                  backgroundColor: '#f3f4f6', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#6b7280' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleDone}
                style={{ flex: 2, paddingVertical: 11, borderRadius: 12,
                  backgroundColor: '#0058bd', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#fff' }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
