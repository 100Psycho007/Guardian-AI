import React from 'react';
import { Share, ScrollView, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Chip, Divider, List, Surface, Text, useTheme } from 'react-native-paper';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedView } from '../../../../components/Themed';
import { RiskMeter } from '../../../../components/RiskMeter';
import {
  StoredScanResult,
  addStoredResult,
  getStoredResultById,
} from '../../../../lib/scanQueue';
import { reportScanToSupabase } from '../../../../lib/reporting';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../hooks/useToast';

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function coerceRiskScore(response: Record<string, unknown> | null | undefined): number {
  if (!response) return 0;
  const direct = getNumber(response.risk_score ?? response.riskScore);
  if (direct != null) return direct;
  const nestedSource = response.risk as Record<string, unknown> | undefined;
  const nested = getNumber(nestedSource?.score ?? nestedSource?.risk_score ?? nestedSource?.value);
  return nested ?? 0;
}

function coerceRiskLevel(response: Record<string, unknown> | null | undefined): string {
  if (!response) return 'unknown';
  const direct = getString(response.risk_level ?? response.riskLevel);
  if (direct) return direct;
  const nestedSource = response.risk as Record<string, unknown> | undefined;
  const nested = getString(nestedSource?.level ?? nestedSource?.risk_level);
  return nested ?? 'unknown';
}

function coerceFraudProbability(response: Record<string, unknown> | null | undefined): number | null {
  if (!response) return null;
  const direct = getNumber(response.fraud_probability ?? response.fraudProbability);
  if (direct != null) return direct;
  const nestedSource = response.risk as Record<string, unknown> | undefined;
  const nested = getNumber(nestedSource?.fraud_probability ?? nestedSource?.probability);
  return nested;
}

function extractFlags(response: Record<string, unknown> | null | undefined): string[] {
  if (!response) return [];
  const candidates = (response.flags ?? response.risk_flags ?? (response.risk as Record<string, unknown> | undefined)?.flags) as unknown;
  if (!Array.isArray(candidates)) return [];

  return candidates
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const label = getString((item as Record<string, unknown>).label);
        if (label) return label;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function extractReasoning(response: Record<string, unknown> | null | undefined) {
  if (!response) {
    return { summary: null, details: [] as string[] };
  }

  const claude = response.claude_analysis as Record<string, unknown> | undefined;
  const summary =
    getString(claude?.summary) ||
    getString(response.analysis_summary) ||
    getString(response.reasoning) ||
    getString(response.summary) ||
    null;

  const details: string[] = [];

  const detailCandidates: unknown[] = [];
  if (claude) {
    detailCandidates.push(claude.analysis, claude.details, claude.reasons, claude.risk_factors);
  }
  detailCandidates.push(response.analysis, response.explanation, response.explanations, response.notes);

  for (const candidate of detailCandidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string') {
      if (!details.includes(candidate)) {
        details.push(candidate);
      }
    } else if (Array.isArray(candidate)) {
      candidate.forEach((entry) => {
        if (typeof entry === 'string' && !details.includes(entry)) {
          details.push(entry);
        }
      });
    }
  }

  return { summary, details };
}

function extractSummary(response: Record<string, unknown> | null | undefined) {
  if (!response) return 'Scan details pending';
  const upiDetails = (response.upi_details ?? response.upiDetails) as Record<string, unknown> | undefined;
  if (!upiDetails) return 'Scan details pending';

  return (
    getString(upiDetails.upiId) ||
    getString(upiDetails.upi_id) ||
    getString(upiDetails.payee) ||
    getString(upiDetails.name) ||
    getString(upiDetails.merchant) ||
    'Scan details pending'
  );
}

function extractStatus(response: Record<string, unknown> | null | undefined) {
  if (!response) return 'unknown';
  return getString(response.status) ?? 'unknown';
}

function extractUPIDetails(response: Record<string, unknown> | null | undefined) {
  const upiDetails = (response?.upi_details ?? response?.upiDetails) as Record<string, unknown> | undefined;
  if (!upiDetails) return [] as Array<{ label: string; value: string }>;

  const getValue = (...keys: string[]) => {
    for (const key of keys) {
      const value = getString(upiDetails[key]);
      if (value) return value;
    }
    return null;
  };

  const details: Array<{ label: string; value: string }> = [];

  const upiId = getValue('upiId', 'upi_id', 'upiID');
  if (upiId) details.push({ label: 'UPI ID', value: upiId });

  const payee = getValue('payee', 'payeeName', 'payee_name', 'name');
  if (payee) details.push({ label: 'Payee', value: payee });

  const payer = getValue('payer', 'payerName', 'payer_name');
  if (payer) details.push({ label: 'Payer', value: payer });

  const merchant = getValue('merchant', 'merchantName', 'merchant_name');
  if (merchant && !details.some((item) => item.label === 'Payee' && item.value === merchant)) {
    details.push({ label: 'Merchant', value: merchant });
  }

  const amount = getValue('amount', 'value', 'transactionAmount');
  if (amount) details.push({ label: 'Amount', value: amount });

  const reference = getValue('reference', 'referenceId', 'reference_id', 'txnId', 'transactionId');
  if (reference) details.push({ label: 'Reference ID', value: reference });

  const note = getValue('note', 'notes', 'narration', 'description');
  if (note) details.push({ label: 'Notes', value: note });

  return details;
}

function formatTimestamp(value: number) {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return new Date(value).toString();
  }
}

function normalizeProbability(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= 1) {
    return Math.round(Math.max(0, value) * 100);
  }
  return Math.round(Math.min(100, Math.max(0, value)));
}

function riskColor(level: string, fallback: string) {
  switch (level.toLowerCase()) {
    case 'low':
      return '#22C55E';
    case 'medium':
    case 'moderate':
      return '#FACC15';
    case 'high':
      return '#F97316';
    case 'critical':
    case 'severe':
      return '#EF4444';
    default:
      return fallback;
  }
}

type SkeletonBlockProps = {
  width?: number | string;
  height: number;
  borderRadius?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
};

function SkeletonBlock({ width = '100%', height, borderRadius = 12, color, style }: SkeletonBlockProps) {
  const opacity = useSharedValue(0.45);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 620, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.6, { duration: 620, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.skeleton, { width, height, borderRadius, backgroundColor: color }, animatedStyle, style]} />;
}

export default function ScanResultScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { showToast } = useToast();
  const currentUserId = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState<StoredScanResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      if (!rawId) {
        setErrorMessage('No result identifier was provided.');
        setLoading(false);
        return () => {};
      }

      let active = true;
      setLoading(true);
      setErrorMessage(null);

      getStoredResultById(rawId)
        .then((item) => {
          if (!active) return;
          if (!item) {
            setResult(null);
            setErrorMessage('We could not find this scan result on your device.');
          } else {
            setResult(item);
          }
        })
        .catch((error) => {
          if (!active) return;
          if (__DEV__) {
            console.warn('Failed to load stored scan result', error);
          }
          setErrorMessage('Unable to load this scan result.');
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [rawId]),
  );

  const response = React.useMemo(() => (result?.response as Record<string, unknown> | undefined) ?? null, [result]);
  const riskScore = React.useMemo(() => coerceRiskScore(response), [response]);
  const riskLevel = React.useMemo(() => coerceRiskLevel(response).toLowerCase(), [response]);
  const fraudProbabilityRaw = React.useMemo(() => coerceFraudProbability(response), [response]);
  const fraudProbabilityPercent = React.useMemo(() => normalizeProbability(fraudProbabilityRaw), [fraudProbabilityRaw]);
  const flags = React.useMemo(() => extractFlags(response), [response]);
  const reasoning = React.useMemo(() => extractReasoning(response), [response]);
  const summary = React.useMemo(() => extractSummary(response), [response]);
  const status = React.useMemo(() => extractStatus(response), [response]);
  const upiDetails = React.useMemo(() => extractUPIDetails(response), [response]);
  const ocrText = React.useMemo(() => getString(response?.ocr_text ?? response?.ocrText), [response]);

  const riskColorValue = riskColor(riskLevel, theme.colors.primary);

  const lastHapticId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!result) return;
    if (!riskLevel) return;
    if (lastHapticId.current === result.id) return;

    lastHapticId.current = result.id;

    const trigger = async () => {
      try {
        switch (riskLevel) {
          case 'critical':
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
          case 'high':
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            break;
          case 'medium':
          case 'moderate':
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
          default:
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            break;
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to trigger haptic feedback', error);
        }
      }
    };

    trigger();
  }, [result, riskLevel]);

  const handleSave = React.useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      await addStoredResult(result);
      showToast({ message: 'Scan result saved to your history.', type: 'success', source: 'scan.result.save' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save result locally.';
      showToast({ message, type: 'error', source: 'scan.result.save' });
    } finally {
      setSaving(false);
    }
  }, [result, showToast]);

  const handleShare = React.useCallback(async () => {
    if (!result) return;

    const lines = [
      `UPI scan summary: ${summary}`,
      `Risk level: ${riskLevel.charAt(0).toUpperCase()}${riskLevel.slice(1)} (${Math.round(riskScore)}/100)`,
    ];

    if (fraudProbabilityPercent != null) {
      lines.push(`Fraud probability: ${fraudProbabilityPercent}%`);
    }

    const upiId = upiDetails.find((detail) => detail.label === 'UPI ID');
    if (upiId) {
      lines.push(`UPI ID: ${upiId.value}`);
    }

    const amount = upiDetails.find((detail) => detail.label === 'Amount');
    if (amount) {
      lines.push(`Amount: ${amount.value}`);
    }

    if (flags.length > 0) {
      lines.push(`Flags: ${flags.join(', ')}`);
    }

    try {
      await Share.share({ message: lines.join('\n') });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open the share sheet.';
      showToast({ message, type: 'error', source: 'scan.result.share' });
    }
  }, [flags, fraudProbabilityPercent, result, riskLevel, riskScore, showToast, summary, upiDetails]);

  const handleReport = React.useCallback(async () => {
    if (!result) return;
    if (!currentUserId) {
      showToast({ message: 'You must be signed in to report this scan.', type: 'error', source: 'scan.result.report' });
      return;
    }

    setReporting(true);
    try {
      await reportScanToSupabase({
        scanId: result.id,
        userId: currentUserId,
        riskLevel,
        riskScore,
        fraudProbability: fraudProbabilityRaw,
        flags,
      });
      showToast({
        message: 'Report submitted. Our fraud team has been notified.',
        type: 'success',
        source: 'scan.result.report',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit report.';
      showToast({ message, type: 'error', source: 'scan.result.report' });
    } finally {
      setReporting(false);
    }
  }, [currentUserId, flags, fraudProbabilityRaw, result, riskLevel, riskScore, showToast]);

  if (loading) {
    return (
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <Surface elevation={2} style={styles.hero}>
            <SkeletonBlock color={theme.colors.surfaceVariant} width={220} height={220} borderRadius={110} />
            <SkeletonBlock color={theme.colors.surfaceVariant} width="70%" height={20} style={styles.skeletonSpacing} />
            <SkeletonBlock color={theme.colors.surfaceVariant} width="50%" height={16} />
          </Surface>

          <Surface elevation={1} style={styles.section}>
            <SkeletonBlock color={theme.colors.surfaceVariant} width="60%" height={18} />
            <SkeletonBlock color={theme.colors.surfaceVariant} width="90%" height={14} style={styles.skeletonItem} />
            <SkeletonBlock color={theme.colors.surfaceVariant} width="85%" height={14} style={styles.skeletonItem} />
          </Surface>

          <Surface elevation={1} style={styles.section}>
            <SkeletonBlock color={theme.colors.surfaceVariant} width="65%" height={18} />
            <SkeletonBlock color={theme.colors.surfaceVariant} width="100%" height={14} style={styles.skeletonItem} />
            <SkeletonBlock color={theme.colors.surfaceVariant} width="100%" height={14} style={styles.skeletonItem} />
          </Surface>
        </ScrollView>
      </ThemedView>
    );
  }

  if (!result) {
    return (
      <ThemedView style={styles.flex}>
        <View style={styles.emptyState}>
          <Text variant="titleLarge" style={styles.emptyTitle}>
            Result unavailable
          </Text>
          <Text style={[styles.muted, styles.emptySubtitle]}>
            {errorMessage ?? 'We could not retrieve this scan result.'}
          </Text>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Surface elevation={2} style={styles.hero}>
          <Text variant="titleMedium" style={styles.summary}>
            {summary}
          </Text>
          <RiskMeter score={riskScore} riskLevel={riskLevel} />
          <Chip
            mode="outlined"
            style={[styles.probabilityChip, { borderColor: riskColorValue }]}
            textStyle={{ color: riskColorValue }}
          >
            Fraud probability: {fraudProbabilityPercent != null ? `${fraudProbabilityPercent}%` : 'Unavailable'}
          </Chip>
          <Text style={[styles.statusText, { color: theme.colors.onSurfaceVariant }]}>Status: {status}</Text>
          <Text style={[styles.timestamp, { color: theme.colors.onSurfaceVariant }]}>Processed {formatTimestamp(result.processedAt)}</Text>
          <Text style={[styles.timestamp, { color: theme.colors.onSurfaceVariant }]}>Storage path: {result.storagePath}</Text>
        </Surface>

        <Surface elevation={1} style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            AI reasoning
          </Text>
          {reasoning.summary ? (
            <List.Accordion
              title={reasoning.summary}
              description={reasoning.details.length ? 'Tap to expand the full reasoning' : undefined}
            >
              {reasoning.details.length ? (
                <View style={styles.accordionContent}>
                  {reasoning.details.map((detail, index) => (
                    <Text key={index.toString()} style={styles.accordionText}>
                      • {detail}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.muted}>No additional reasoning provided.</Text>
              )}
            </List.Accordion>
          ) : (
            <Text style={styles.muted}>No AI reasoning was provided for this scan.</Text>
          )}
        </Surface>

        <Surface elevation={1} style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Fraud flags
          </Text>
          {flags.length > 0 ? (
            <View style={styles.flagsContainer}>
              {flags.map((flag) => (
                <Chip key={flag} compact style={styles.flagChip}>
                  {flag}
                </Chip>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No fraud indicators were triggered.</Text>
          )}
        </Surface>

        <Surface elevation={1} style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Transaction details
          </Text>
          {upiDetails.length > 0 ? (
            <View style={styles.detailsList}>
              {upiDetails.map((detail, index) => (
                <View key={`${detail.label}-${index.toString()}`} style={styles.detailRow}>
                  <Text variant="labelLarge" style={styles.detailLabel}>
                    {detail.label}
                  </Text>
                  <Text style={styles.detailValue}>{detail.value}</Text>
                  {index !== upiDetails.length - 1 ? <Divider style={styles.detailDivider} /> : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No transaction metadata was extracted from this scan.</Text>
          )}
        </Surface>

        {ocrText ? (
          <Surface elevation={1} style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              OCR text
            </Text>
            <Text style={styles.ocrText}>{ocrText}</Text>
          </Surface>
        ) : null}

        <View style={styles.actionsRow}>
          <Button
            mode="contained-tonal"
            icon="content-save-outline"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.actionButton}
          >
            Save
          </Button>
          <Button
            mode="contained-tonal"
            icon="share-variant"
            onPress={handleShare}
            style={styles.actionButton}
          >
            Share
          </Button>
          <Button
            mode="contained"
            icon="alert-circle-outline"
            onPress={handleReport}
            loading={reporting}
            disabled={reporting}
            style={styles.actionButton}
          >
            Report
          </Button>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={4000}
      >
        {snackbar.message}
      </Snackbar>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  hero: {
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    gap: 16,
  },
  summary: {
    textAlign: 'center',
    fontWeight: '600',
  },
  probabilityChip: {
    marginTop: 4,
  },
  statusText: {
    marginTop: 4,
  },
  timestamp: {
    fontSize: 12,
  },
  section: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  accordionContent: {
    gap: 8,
    paddingTop: 8,
  },
  accordionText: {
    lineHeight: 20,
  },
  flagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flagChip: {
    borderRadius: 999,
  },
  detailsList: {
    gap: 12,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 15,
  },
  detailDivider: {
    marginTop: 12,
  },
  ocrText: {
    fontSize: 14,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minWidth: 120,
  },
  muted: {
    opacity: 0.7,
  },
  skeleton: {
    overflow: 'hidden',
  },
  skeletonSpacing: {
    marginTop: 16,
    marginBottom: 8,
  },
  skeletonItem: {
    marginTop: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
});
