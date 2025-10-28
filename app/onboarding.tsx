import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Button, Text, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedView } from '../components/Themed';
import { useAuth } from '../hooks/useAuth';
import { setOnboardingComplete } from '../lib/storage';

const { width } = Dimensions.get('window');

type Slide = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const slides: Slide[] = [
  {
    key: 'secure',
    title: 'Secure Your Identity',
    description: 'Protect sensitive documents with trusted verification workflows.',
    icon: 'lock',
  },
  {
    key: 'scan',
    title: 'Scan Documents Quickly',
    description: 'Upload and process scans in seconds with guided capture tips.',
    icon: 'document-scanner',
  },
  {
    key: 'alerts',
    title: 'Stay Ahead of Fraud',
    description: 'Get notified about suspicious activity so you can take action fast.',
    icon: 'notifications-active',
  },
];

function ProgressDot({ index, scrollX, color }: { index: number; scrollX: SharedValue<number>; color: string }) {
  const animatedStyle = useAnimatedStyle(() => {
    const progress = scrollX.value / width;
    const dotWidth = interpolate(progress, [index - 1, index, index + 1], [8, 24, 8], Extrapolate.CLAMP);
    const opacity = interpolate(progress, [index - 1, index, index + 1], [0.4, 1, 0.4], Extrapolate.CLAMP);

    return {
      width: dotWidth,
      opacity,
      backgroundColor: color,
    };
  });

  return <Animated.View style={[styles.indicator, animatedStyle]} />;
}

export default function OnboardingScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const scrollX = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const scrollRef = React.useRef<Animated.ScrollView>(null);

  const completeOnboarding = React.useCallback(async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      await setOnboardingComplete(true);
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/sign-in');
      }
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, router, session]);

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const index = Math.round(event.contentOffset.x / width);
      runOnJS(setCurrentIndex)(Math.max(0, Math.min(slides.length - 1, index)));
    },
  });

  const handleNext = React.useCallback(() => {
    if (currentIndex >= slides.length - 1) {
      completeOnboarding();
      return;
    }

    const nextIndex = currentIndex + 1;
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    setCurrentIndex(nextIndex);
  }, [completeOnboarding, currentIndex]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Button mode="text" onPress={completeOnboarding} disabled={isCompleting} accessibilityLabel="Skip onboarding">
            Skip
          </Button>
        </View>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {slides.map((slide) => (
            <View key={slide.key} style={[styles.slide, { width }]}> 
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryContainer }]}> 
                <MaterialIcons name={slide.icon} size={48} color={theme.colors.primary} />
              </View>
              <Text variant="headlineMedium" style={styles.title} accessibilityRole="header">
                {slide.title}
              </Text>
              <Text variant="bodyLarge" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
                accessibilityLabel={slide.description}
              >
                {slide.description}
              </Text>
            </View>
          ))}
        </Animated.ScrollView>
        <View style={styles.footer}>
          <View style={styles.indicators}>
            {slides.map((slide, index) => (
              <ProgressDot key={slide.key} index={index} scrollX={scrollX} color={theme.colors.primary} />
            ))}
          </View>
          <View style={styles.actions}>
            {currentIndex < slides.length - 1 ? (
              <Button
                mode="outlined"
                onPress={handleNext}
                disabled={isCompleting}
                style={styles.secondaryAction}
                accessibilityLabel="Next onboarding step"
              >
                Next
              </Button>
            ) : (
              <View style={styles.secondaryAction} accessible={false} />
            )}
            <Button
              mode="contained"
              onPress={completeOnboarding}
              style={styles.primaryAction}
              accessibilityLabel={currentIndex === slides.length - 1 ? 'Get started' : 'Finish onboarding'}
              loading={isCompleting}
            >
              {currentIndex === slides.length - 1 ? 'Get started' : 'Skip for now'}
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconContainer: {
    height: 96,
    width: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
    gap: 16,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8d8d8d',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
  },
  primaryAction: {
    flex: 1,
  },
});
