import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
}

export default function Input({
  label,
  error,
  hint,
  prefix,
  suffix,
  style,
  ...rest
}: InputProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text className="text-sm font-medium text-slate-700 mb-1">{label}</Text>
      )}
      <View
        className={[
          'flex-row items-center bg-white rounded-xl border px-4 py-0',
          error ? 'border-red-400' : 'border-slate-200',
        ].join(' ')}
      >
        {prefix && (
          <Text className="text-slate-400 text-sm mr-2">{prefix}</Text>
        )}
        <TextInput
          className="flex-1 text-slate-800 text-base py-3"
          placeholderTextColor="#94a3b8"
          {...rest}
        />
        {suffix && (
          <Text className="text-slate-400 text-sm ml-2">{suffix}</Text>
        )}
      </View>
      {error && (
        <Text className="text-red-500 text-xs mt-1">{error}</Text>
      )}
      {hint && !error && (
        <Text className="text-slate-400 text-xs mt-1">{hint}</Text>
      )}
    </View>
  );
}
