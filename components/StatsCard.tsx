import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';

export type StatsCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  iconName?: keyof typeof MaterialIcons.glyphMap;
  accentColor?: string;
  onPress?: () => void;
  testID?: string;
};

export function StatsCard({ title, value, subtitle, iconName, accentColor, onPress, testID }: StatsCardProps) {
  const theme = useTheme();
  const iconBackground = accentColor ?? theme.colors.primaryContainer;
  const iconColor = accentColor ? theme.colors.onPrimary : theme.colors.primary;

  const content = (
    <View style={styles.content}>
      <View style={styles.headerRow}>
        {iconName ? (
          <View style={[styles.iconContainer, { backgroundColor: iconBackground }]}
            accessibilityRole="image"
            accessibilityLabel={`${title} icon`}>
            <MaterialIcons name={iconName} size={20} color={iconColor} />
          </View>
        ) : null}
        <Text variant="titleSmall" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
      <Text variant="headlineMedium" style={styles.value} accessibilityRole="text">
        {value}
      </Text>
      {subtitle ? (
        <Text variant="bodySmall" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Surface style={styles.card} elevation={2} testID={testID} accessibilityRole={onPress ? 'button' : 'summary'}>
      {onPress ? (
        <TouchableRipple onPress={onPress} style={styles.touchable} borderless>
          {content}
        </TouchableRipple>
      ) : (
        content
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    flex: 1,
    minWidth: 160,
  },
  touchable: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontWeight: '600',
  },
  value: {
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 18,
  },
});
