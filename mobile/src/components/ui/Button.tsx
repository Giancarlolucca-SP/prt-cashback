import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  TouchableOpacityProps,
  View,
} from 'react-native';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: Variant;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS: Record<Variant, { container: string; text: string }> = {
  primary:   { container: 'bg-accent-500 active:bg-accent-600',          text: 'text-white font-bold' },
  secondary: { container: 'bg-primary-700 active:bg-primary-800',        text: 'text-white font-bold' },
  ghost:     { container: 'bg-transparent border border-primary-700',    text: 'text-primary-700 font-semibold' },
  danger:    { container: 'bg-red-500 active:bg-red-600',                text: 'text-white font-bold' },
};

export default function Button({
  title,
  variant = 'primary',
  loading = false,
  loadingText,
  fullWidth = false,
  icon,
  disabled,
  className: externalClassName,
  style,
  ...rest
}: ButtonProps) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;
  const indicatorColor = variant === 'ghost' ? '#1e3a5f' : '#fff';

  return (
    <TouchableOpacity
      className={[
        'flex-row items-center justify-center gap-2 rounded-xl px-5 py-3.5',
        v.container,
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        externalClassName,
      ].filter(Boolean).join(' ')}
      style={style}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <>
          <ActivityIndicator color={indicatorColor} size="small" />
          {loadingText && (
            <Text className={`text-base ${v.text}`}>{loadingText}</Text>
          )}
        </>
      ) : (
        <>
          {icon && <View>{icon}</View>}
          <Text className={`text-base ${v.text}`}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
