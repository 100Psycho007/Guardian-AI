import React from 'react';
import { View, ViewProps, Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTheme } from 'react-native-paper';

export function ThemedView({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: theme.colors.background }, style]} {...props} />;
}

export function ThemedText({ style, ...props }: RNTextProps) {
  const theme = useTheme();
  return <RNText style={[{ color: theme.colors.onBackground }, style]} {...props} />;
}
