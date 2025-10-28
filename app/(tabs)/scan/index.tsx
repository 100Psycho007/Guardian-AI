import React from 'react';
import { Image, Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import { PermissionStatus } from 'expo-modules-core';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { useIsFocused } from '@react-navigation/native';
import { Link, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, IconButton, Text, useTheme, ActivityIndicator, Surface } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '../../../components/Themed';
import { LoadingOverlay, LoadingStep, LoadingStepStatus } from '../../../components/LoadingOverlay';
import {
  PendingScan,
  StoredScanResult,
  addPendingScan,
  addStoredResult,
  getScanRetryDelay,
  loadPendingScans,
  removePendingScan,
  updatePendingScan,
} from '../../../lib/scanQueue';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../hooks/useToast';
import { useConnectivity } from '../../../contexts/ConnectivityContext';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const BUCKET_NAME = 'scans';

type StepKey = 'capture' | 'compress' | 'upload' | 'analyze';

type OverlayContext = 'capture' | 'queue';

type OverlayState = {
  context: OverlayContext;
  title: string;
  message?: string;
  error?: string | null;
  steps: LoadingStep[];
  dismissLabel?: string;
  retryLabel?: string;
  visible: boolean;
};

const BASE_STEPS: LoadingStep[] = [
  { key: 'capture', label: 'Capture', status: 'active' },
  { key: 'compress', label: 'Optimize', status: 'pending' },
  { key: 'upload', label: 'Upload', status: 'pending' },
  { key: 'analyze', label: 'Analyze', status: 'pending' },
];

function createUniqueId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function initialSteps() {
  return BASE_STEPS.map((step) => ({ ...step }));
}

export default function ScanScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const { showToast } = useToast();
  const isFocused = useIsFocused();

  const [permissionStatus, setPermissionStatus] = React.useState<PermissionStatus | null>(null);
  const [flashMode, setFlashMode] = React.useState<FlashMode>(FlashMode.off);
  const [cameraType, setCameraType] = React.useState<CameraType>(CameraType.back);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [queue, setQueue] = React.useState<PendingScan[]>([]);
  const [overlayState, setOverlayState] = React.useState<OverlayState | null>(null);
  const [previewPhoto, setPreviewPhoto] = React.useState<{ uri: string; capturedAt: number } | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewProcessing, setPreviewProcessing] = React.useState(false);

  const overlayRetryRef = React.useRef<(() => void) | null>(null);
  const cameraRef = React.useRef<Camera | null>(null);
  const capturingRef = React.useRef(false);
  const currentStepRef = React.useRef<StepKey>('capture');
  const queueRef = React.useRef<PendingScan[]>([]);
  const processingQueueRef = React.useRef(false);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const setQueueState = React.useCallback((items: PendingScan[]) => {
    queueRef.current = items;
    setQueue(items);
  }, []);

  const hideOverlay = React.useCallback(() => {
    overlayRetryRef.current = null;
    setOverlayState(null);
  }, []);

  const showOverlay = React.useCallback(
    (state: Omit<OverlayState, 'visible'>, retryHandler?: () => void) => {
      overlayRetryRef.current = retryHandler ?? null;
      setOverlayState({ ...state, visible: true });
    },
    [],
  );

  const updateOverlaySteps = React.useCallback((updater: (steps: LoadingStep[]) => LoadingStep[]) => {
    setOverlayState((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: updater(prev.steps) };
    });
  }, []);

  const updateStepStatus = React.useCallback(
    (key: StepKey, status: LoadingStepStatus) => {
      updateOverlaySteps((steps) => steps.map((step) => (step.key === key ? { ...step, status } : step)));
    },
    [updateOverlaySteps],
  );

  React.useEffect(() => {
    let active = true;

    const prepare = async () => {
      const permission = await Camera.getCameraPermissionsAsync();
      if (!active) return;

      if (permission.status === 'granted') {
        setPermissionStatus(permission.status);
        return;
      }

      if (permission.status === 'undetermined') {
        const requested = await Camera.requestCameraPermissionsAsync();
        if (active) {
          setPermissionStatus(requested.status);
        }
      } else {
        setPermissionStatus(permission.status);
      }
    };

    prepare();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    loadPendingScans()
      .then((items) => {
        setQueueState(items);
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('Failed to load pending scans', error);
        }
      });
  }, [setQueueState]);

  React.useEffect(() => {
    if (!isFocused) {
      setCameraReady(false);
    }
  }, [isFocused]);

  const compressImage = React.useCallback(async (uri: string) => {
    let currentUri = uri;
    let info = await FileSystem.getInfoAsync(currentUri);

    if (!info.exists) {
      throw new Error('Captured image could not be found. Please try again.');
    }

    if ((info.size ?? 0) <= MAX_IMAGE_BYTES) {
      return { uri: currentUri, size: info.size ?? 0 };
    }

    let quality = 0.9;

    while (quality > 0.1) {
      const manipulated = await ImageManipulator.manipulateAsync(currentUri, [], {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      currentUri = manipulated.uri;
      info = await FileSystem.getInfoAsync(currentUri);
      if (!info.exists) {
        throw new Error('Failed to optimize captured image.');
      }
      if ((info.size ?? 0) <= MAX_IMAGE_BYTES) {
        return { uri: currentUri, size: info.size ?? 0 };
      }
      quality -= 0.2;
    }

    throw new Error('Unable to compress image below 2MB. Try capturing again with a tighter crop.');
  }, []);

  const uploadToSupabase = React.useCallback(async (item: PendingScan) => {
    const source = item.localUri.startsWith('file://') ? item.localUri : `file://${item.localUri}`;
    const fileResponse = await fetch(source);
    const blob = await fileResponse.blob();
    const { error } = await supabase.storage.from(item.bucket).upload(item.storagePath, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });

    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const analyzeScan = React.useCallback(async (item: PendingScan) => {
    const { data, error } = await supabase.functions.invoke('analyze-upi', {
      body: {
        storage_path: item.storagePath,
        bucket: item.bucket,
        metadata: {
          source: 'mobile',
          ...item.metadata,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }, []);

  const persistQueueItem = React.useCallback(
    async (item: PendingScan) => {
      const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!directory) {
        throw new Error('Storage directory is unavailable.');
      }

      const targetUri = `${directory}${item.id}.jpg`;

      if (item.localUri !== targetUri) {
        await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
        await FileSystem.copyAsync({ from: item.localUri, to: targetUri });
      }

      const queuedItem: PendingScan = {
        ...item,
        localUri: targetUri,
        attempts: item.attempts ?? 0,
        lastError: item.lastError ?? null,
        nextRetryAt: item.nextRetryAt ?? Date.now(),
      };

      const nextQueue = await addPendingScan(queuedItem);
      setQueueState(nextQueue);
      return queuedItem;
    },
    [addPendingScan, setQueueState],
  );

  const finalizeSuccess = React.useCallback(
    (context: OverlayContext) => {
      setOverlayState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          title: context === 'queue' ? 'Scan synced' : 'Scan complete',
          message:
            context === 'queue'
              ? 'The offline scan has been uploaded and analyzed.'
              : 'Your scan has been uploaded and analyzed.',
          error: null,
        };
      });
      overlayRetryRef.current = null;
      showToast({
        message: context === 'queue' ? 'Offline scan synced successfully.' : 'Scan processed successfully.',
        type: 'success',
        source: context === 'queue' ? 'scan.queue' : 'scan.capture',
      });
    },
    [showToast],
  );

  const processScanItem = React.useCallback(
    async (
      item: PendingScan,
      options: { context: OverlayContext; ephemeral?: boolean; stepsInitialized?: boolean; skipDeletion?: boolean },
    ): Promise<boolean> => {
      currentStepRef.current = 'upload';

      if (!options.stepsInitialized) {
        const steps = initialSteps().map((step) =>
          step.key === 'capture' || step.key === 'compress' ? { ...step, status: 'complete' } : step,
        );
        showOverlay({
          context: options.context,
          title: options.context === 'queue' ? 'Syncing offline scan' : 'Processing scan',
          message: 'Uploading image…',
          steps,
        });
      }

      updateOverlaySteps((steps) =>
        steps.map((step) => {
          if (step.key === 'upload') return { ...step, status: 'active' };
          if (step.key === 'analyze') return { ...step, status: 'pending' };
          return step;
        }),
      );
      setOverlayState((prev) => (prev ? { ...prev, message: 'Uploading image…', error: null } : prev));

      try {
        await uploadToSupabase(item);
        updateStepStatus('upload', 'complete');

        currentStepRef.current = 'analyze';
        updateStepStatus('analyze', 'active');
        setOverlayState((prev) => (prev ? { ...prev, message: 'Analyzing scan…' } : prev));

        const analysis = await analyzeScan(item);
        updateStepStatus('analyze', 'complete');
        const storedResult: StoredScanResult = {
          id: item.id,
          userId: item.userId,
          bucket: item.bucket,
          storagePath: item.storagePath,
          createdAt: item.createdAt,
          processedAt: Date.now(),
          response: analysis,
        };
        await addStoredResult(storedResult);

        if (!options.ephemeral) {
          const nextQueue = await removePendingScan(item.id);
          setQueueState(nextQueue);
        }

        if (!options.skipDeletion) {
          await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => undefined);
        }

        finalizeSuccess(options.context);

        if (userId) {
          void queryClient.invalidateQueries({ queryKey: ['fraudAlerts', userId] });
        }

        if (options.context === 'queue') {
          setTimeout(() => {
            hideOverlay();
          }, 1200);
        } else if (options.context === 'capture' && options.ephemeral) {
          setPreviewPhoto(null);
          setTimeout(() => {
            hideOverlay();
            router.push({
              pathname: '/(tabs)/scan/result/[id]',
              params: { id: storedResult.id },
            });
          }, 650);
        }

        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process scan.';
        const failingStep = currentStepRef.current;
        updateOverlaySteps((steps) =>
          steps.map((step) => {
            if (step.key === failingStep) {
              return { ...step, status: 'error' };
            }
            if (failingStep === 'analyze' && step.key === 'upload') {
              return { ...step, status: 'complete' };
            }
            return step;
          }),
        );

        setOverlayState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            title: 'Processing failed',
            message:
              options.context === 'queue'
                ? 'We will retry automatically once you are back online.'
                : 'The scan is saved and will retry when network connectivity returns.',
            error: message,
            retryLabel: isOnline ? 'Retry now' : undefined,
            dismissLabel: 'Close',
          };
        });

        const attempts = item.attempts + 1;
        const retryAt = Date.now() + getScanRetryDelay(attempts);
        const queuedItem = await persistQueueItem({
          ...item,
          attempts,
          lastError: message,
          nextRetryAt: retryAt,
        });

        if (!options.ephemeral) {
          const nextQueue = await updatePendingScan(queuedItem.id, {
            attempts: queuedItem.attempts,
            lastError: queuedItem.lastError,
            nextRetryAt: queuedItem.nextRetryAt,
          });
          setQueueState(nextQueue);
        }

        overlayRetryRef.current = isOnline
          ? () => {
              hideOverlay();
              const immediateItem = { ...queuedItem, nextRetryAt: Date.now() };
              updatePendingScan(immediateItem.id, { nextRetryAt: immediateItem.nextRetryAt })
                .then(setQueueState)
                .catch(() => undefined);
              processScanItem(immediateItem, {
                context: options.context,
                ephemeral: false,
                stepsInitialized: false,
              }).catch(() => undefined);
            }
          : null;

        return false;
      }
    },
    [
      addStoredResult,
      analyzeScan,
      finalizeSuccess,
      hideOverlay,
      isOnline,
      persistQueueItem,
      queryClient,
      removePendingScan,
      router,
      setOverlayState,
      setPreviewPhoto,
      setQueueState,
      showOverlay,
      updateOverlaySteps,
      updateStepStatus,
      uploadToSupabase,
      updatePendingScan,
      userId,
    ],
  );

  const processQueue = React.useCallback(async () => {
    if (!isOnline) return;
    if (processingQueueRef.current) return;
    if (!queueRef.current.length) return;

    const now = Date.now();
    const pending = [...queueRef.current]
      .filter((item) => (item.nextRetryAt ?? now) <= now)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (pending.length === 0) {
      return;
    }

    processingQueueRef.current = true;
    try {
      for (const item of pending) {
        const steps = initialSteps().map((step) => {
          if (step.key === 'capture' || step.key === 'compress') {
            return { ...step, status: 'complete' };
          }
          return step;
        });

        showOverlay({
          context: 'queue',
          title: 'Syncing offline scan',
          message: 'Uploading pending scan…',
          steps,
        });

        const success = await processScanItem(item, { context: 'queue', ephemeral: false, stepsInitialized: true });
        if (!success) {
          break;
        }
      }
    } finally {
      processingQueueRef.current = false;
    }
  }, [isOnline, processScanItem, showOverlay]);

  const scheduleQueueProcessing = React.useCallback(
    (forceImmediate = false) => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (!isOnline || processingQueueRef.current || queueRef.current.length === 0) {
        return;
      }

      const now = Date.now();
      const hasDueItem =
        forceImmediate || queueRef.current.some((item) => (item.nextRetryAt ?? now) <= now);

      const run = () => {
        processQueue().catch((error) => {
          if (__DEV__) {
            console.warn('Queue processing failed', error);
          }
        });
      };

      if (hasDueItem) {
        retryTimerRef.current = setTimeout(run, 0);
        return;
      }

      const nextTimestamp = queueRef.current.reduce<number | null>((acc, item) => {
        const candidate = item.nextRetryAt ?? now;
        return acc === null || candidate < acc ? candidate : acc;
      }, null);

      if (nextTimestamp == null) {
        retryTimerRef.current = setTimeout(run, 0);
        return;
      }

      const delay = Math.max(nextTimestamp - now, 0);
      retryTimerRef.current = setTimeout(run, delay);
    },
    [isOnline, processQueue],
  );

  React.useEffect(() => {
    scheduleQueueProcessing();
  }, [scheduleQueueProcessing, queue]);

  React.useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const handleCapture = React.useCallback(async () => {
    if (!cameraRef.current || capturingRef.current || previewProcessing) return;
    if (!userId) {
      showToast({ message: 'You must be signed in to capture scans.', type: 'error', source: 'scan.capture' });
      return;
    }

    capturingRef.current = true;
    currentStepRef.current = 'capture';

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: true });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPreviewPhoto({ uri: photo.uri, capturedAt: Date.now() });
      setPreviewError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to capture scan. Please try again.';
      showToast({ message, type: 'error', source: 'scan.capture' });
    } finally {
      capturingRef.current = false;
    }
  }, [cameraRef, previewProcessing, setPreviewError, setPreviewPhoto, showToast, userId]);

  const handleRetake = React.useCallback(() => {
    if (previewPhoto) {
      FileSystem.deleteAsync(previewPhoto.uri, { idempotent: true }).catch(() => undefined);
    }
    setPreviewPhoto(null);
    setPreviewError(null);
  }, [previewPhoto]);

  const handleConfirmPreview = React.useCallback(async () => {
    if (!previewPhoto || previewProcessing) return;
    if (!userId) {
      showToast({ message: 'You must be signed in to process scans.', type: 'error', source: 'scan.process' });
      return;
    }

    setPreviewProcessing(true);
    setPreviewError(null);
    currentStepRef.current = 'compress';

    const steps = initialSteps().map((step) => {
      if (step.key === 'capture') {
        return { ...step, status: 'complete' };
      }
      if (step.key === 'compress') {
        return { ...step, status: 'active' };
      }
      return step;
    });

    showOverlay({
      context: 'capture',
      title: 'Processing scan',
      message: 'Optimizing image…',
      steps,
      dismissLabel: 'Close',
    });

    updateStepStatus('capture', 'complete');
    updateStepStatus('compress', 'active');

    try {
      const optimized = await compressImage(previewPhoto.uri);
      updateStepStatus('compress', 'complete');
      setOverlayState((prev) => (prev ? { ...prev, message: 'Preparing upload…' } : prev));

      if (optimized.uri !== previewPhoto.uri) {
        await FileSystem.deleteAsync(previewPhoto.uri, { idempotent: true }).catch(() => undefined);
      }

      const id = createUniqueId();
      const storagePath = `${BUCKET_NAME}/${userId}/${id}.jpg`;
      const metadata = {
        capturedAt: new Date(previewPhoto.capturedAt).toISOString(),
      };

      const baseItem: PendingScan = {
        id,
        userId,
        bucket: BUCKET_NAME,
        storagePath,
        localUri: optimized.uri,
        createdAt: Date.now(),
        metadata,
        attempts: 0,
      };

      if (!isOnline) {
        const queuedItem = await persistQueueItem(baseItem);
        if (queuedItem.localUri !== baseItem.localUri) {
          await FileSystem.deleteAsync(baseItem.localUri, { idempotent: true }).catch(() => undefined);
        }
        updateOverlaySteps((current) =>
          current.map((step) => {
            if (step.key === 'upload' || step.key === 'analyze') {
              return { ...step, status: 'pending' };
            }
            return step;
          }),
        );
        setOverlayState((prev) =>
          prev
            ? {
                ...prev,
                title: 'Saved for later',
                message: 'You are offline. The scan will sync automatically once you reconnect.',
                error: null,
              }
            : prev,
        );
        showToast({ message: 'Scan saved and will sync when back online.', type: 'info', source: 'scan.offline_queue' });
        overlayRetryRef.current = isOnline
          ? () => {
              hideOverlay();
              processScanItem(queuedItem, { context: 'capture', ephemeral: false, stepsInitialized: false }).catch(
                () => undefined,
              );
            }
          : null;
        setPreviewPhoto(null);
        return;
      }

      await processScanItem(baseItem, {
        context: 'capture',
        ephemeral: true,
        stepsInitialized: true,
        skipDeletion: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process scan. Please try again.';
      setPreviewError(message);
      setOverlayState((prev) =>
        prev
          ? {
              ...prev,
              title: 'Processing failed',
              message,
              error: message,
            }
          : prev,
      );
      overlayRetryRef.current = () => hideOverlay();
    } finally {
      setPreviewProcessing(false);
    }
  }, [
    compressImage,
    hideOverlay,
    isOnline,
    persistQueueItem,
    previewPhoto,
    previewProcessing,
    processScanItem,
    setOverlayState,
    setPreviewError,
    setPreviewPhoto,
    showOverlay,
    showToast,
    updateOverlaySteps,
    updateStepStatus,
    userId,
  ]);

  const handlePermissionRequest = React.useCallback(async () => {
    const result = await Camera.requestCameraPermissionsAsync();
    setPermissionStatus(result.status);
    if (result.status !== 'granted') {
      showToast({ message: 'Camera permission is required to scan receipts.', type: 'error', source: 'scan.permission' });
    }
  }, [showToast]);

  const toggleFlash = React.useCallback(() => {
    setFlashMode((current) => (current === FlashMode.off ? FlashMode.on : FlashMode.off));
  }, []);

  const toggleCamera = React.useCallback(() => {
    setCameraType((current) => (current === CameraType.back ? CameraType.front : CameraType.back));
  }, []);

  const pendingCount = queue.length;
  const captureDisabled = !cameraReady || previewProcessing || Boolean(previewPhoto);

  if (permissionStatus === null) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.centeredMessage}>Checking camera permissions…</Text>
      </ThemedView>
    );
  }

  if (permissionStatus !== 'granted') {
    return (
      <ThemedView style={styles.centered}>
        <MaterialIcons name="photo-camera" size={64} color={theme.colors.onSurfaceDisabled} />
        <Text variant="headlineMedium" style={styles.permissionTitle}>
          Camera access needed
        </Text>
        <Text style={styles.permissionBody}>
          Enable camera permissions to capture and analyze UPI receipts.
        </Text>
        <Button mode="contained" onPress={handlePermissionRequest} style={styles.permissionButton}>
          Grant permission
        </Button>
        <Button onPress={() => Linking.openSettings()}>Open settings</Button>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      {isFocused ? (
        <Camera
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={styles.camera}
          type={cameraType}
          flashMode={flashMode}
          onCameraReady={() => setCameraReady(true)}
          ratio="16:9"
        />
      ) : null}

      <View pointerEvents="none" style={styles.overlayContainer}>
        <View style={styles.overlayMask}>
          <View style={[styles.maskRow, { backgroundColor: theme.colors.scrim }]} />
          <View style={styles.maskMiddleRow}>
            <View style={[styles.maskSide, { backgroundColor: theme.colors.scrim }]} />
            <View style={styles.focusWindow} />
            <View style={[styles.maskSide, { backgroundColor: theme.colors.scrim }]} />
          </View>
          <View style={[styles.maskRow, { backgroundColor: theme.colors.scrim }]} />
        </View>
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}> 
        <Surface elevation={2} style={styles.statusPill}>
          <MaterialIcons
            name={isOnline ? 'cloud-done' : 'cloud-off'}
            size={18}
            color={isOnline ? theme.colors.primary : theme.colors.error}
          />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
          {pendingCount > 0 ? <Text style={styles.pendingBadge}>{pendingCount}</Text> : null}
        </Surface>
        <View style={styles.iconRow} pointerEvents="auto">
          <IconButton
            icon={flashMode === FlashMode.off ? 'flash-off' : 'flash'}
            onPress={toggleFlash}
            mode="contained-tonal"
            size={22}
          />
          <IconButton icon="camera-switch" onPress={toggleCamera} mode="contained-tonal" size={22} />
        </View>
      </View>

      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 24 }]}> 
        <View style={styles.captureRow}>
          <Link href="/(tabs)/scan/history" asChild>
            <TouchableOpacity style={styles.historyButton}>
              <MaterialIcons name="history" size={26} color={theme.colors.onSurface} />
              <Text style={styles.historyLabel}>History</Text>
            </TouchableOpacity>
          </Link>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Capture receipt"
            style={[styles.captureButton, captureDisabled ? styles.captureButtonDisabled : null]}
            onPress={handleCapture}
            disabled={captureDisabled}
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={styles.spacer} />
        </View>
        <Text style={styles.helperText}>Align the UPI receipt within the frame before capturing.</Text>
      </View>

      {previewPhoto ? (
        <View style={[styles.previewOverlay, { paddingTop: insets.top + 24 }]}> 
          <View style={styles.previewImageContainer}>
            <Image source={{ uri: previewPhoto.uri }} style={styles.previewImage} resizeMode="contain" />
          </View>
          <View style={[styles.previewActions, { paddingBottom: insets.bottom + 24 }]}> 
            {previewError ? <Text style={[styles.previewError, { color: theme.colors.error }]}>{previewError}</Text> : null}
            <View style={styles.previewButtons}>
              <Button mode="outlined" onPress={handleRetake} disabled={previewProcessing} style={styles.previewButton}>
                Retake
              </Button>
              <Button
                mode="contained"
                onPress={handleConfirmPreview}
                loading={previewProcessing}
                disabled={previewProcessing}
                style={styles.previewButton}
              >
                Confirm
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      <LoadingOverlay
        visible={Boolean(overlayState?.visible)}
        title={overlayState?.title ?? ''}
        message={overlayState?.message}
        error={overlayState?.error}
        steps={overlayState?.steps ?? initialSteps()}
        dismissLabel={overlayState?.dismissLabel}
        retryLabel={overlayState?.retryLabel}
        onDismiss={overlayState?.dismissLabel ? hideOverlay : undefined}
        onRetry={overlayRetryRef.current ? () => overlayRetryRef.current?.() : undefined}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayMask: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  maskRow: {
    flex: 1,
    opacity: 0.55,
  },
  maskMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  maskSide: {
    flex: 1,
    opacity: 0.55,
  },
  focusWindow: {
    width: '70%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 16,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  statusText: {
    marginLeft: 6,
    fontSize: 14,
  },
  pendingBadge: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  iconRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  captureRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  historyLabel: {
    fontSize: 16,
  },
  spacer: {
    width: 60,
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  captureButtonDisabled: {
    opacity: 0.45,
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
  },
  helperText: {
    color: 'white',
    textAlign: 'center',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  previewImageContainer: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewActions: {
    width: '100%',
    gap: 12,
    marginTop: 24,
  },
  previewButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  previewButton: {
    flex: 1,
  },
  previewError: {
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  centeredMessage: {
    marginTop: 12,
  },
  permissionTitle: {
    marginTop: 16,
  },
  permissionBody: {
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    marginBottom: 12,
  },
});
