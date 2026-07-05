import { View, Text } from 'react-native';
import type { CaseStatus } from '@/types/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/types/types';
import { F } from '@/lib/fonts';

interface StatusBadgeProps {
  status: CaseStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderRadius: 999,
        paddingHorizontal: size === 'sm' ? 8 : 10,
        paddingVertical: size === 'sm' ? 3 : 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          borderRadius: 999,
          backgroundColor: colors.dot,
        }}
      />
      <Text
        style={{
          color: colors.text,
          fontSize: size === 'sm' ? 10 : 11,
          fontFamily: F.bold,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
