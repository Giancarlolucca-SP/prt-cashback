import React from 'react';
import { View, Text, Image } from 'react-native';
import { useBranding } from '../hooks/useBranding';

interface Props {
  size?:    'sm' | 'md' | 'lg';
  variant?: 'color' | 'white';
}

const SIZES = {
  sm: { width: 80,  height: 26 },
  md: { width: 120, height: 40 },
  lg: { width: 160, height: 53 },
};

const FONT_SIZES = { sm: 16, md: 22, lg: 30 };

export default function BrandLogo({ size = 'md', variant = 'color' }: Props) {
  const { logoUrl, primaryColor, appName } = useBranding();
  const dims = SIZES[size];

  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: dims.width, height: dims.height, resizeMode: 'contain' }}
        accessibilityLabel={appName}
      />
    );
  }

  const textColor = variant === 'white' ? '#ffffff' : primaryColor;

  return (
    <View style={{ width: dims.width, height: dims.height, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: textColor, fontSize: FONT_SIZES[size], fontWeight: '800', letterSpacing: -0.5 }}>
        {appName}
      </Text>
    </View>
  );
}
