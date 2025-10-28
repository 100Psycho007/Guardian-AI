import React from 'react';
import { Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import { PermissionStatus } from 'expo-modules-core';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { useIsFocused } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Link } from 'expo-router';
import {
  Button,
  IconButton,
  Text,
  useTheme,
  ActivityIndicator,
  Snackbar,
  Surface,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '../../../components/Themed';
import { LoadingOverlay, LoadingStep, LoadingStepStatus } from '../../../components/LoadingOverlay';
import {
  PendingScan,
  addPendingScan,
  addStoredResult,
  loadPendingScans,
  removePendingScan,
  updatePendingScan,
} from '../../../lib/scanQueue';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';

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
  const userId = session?.user?.id;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const isFocused = useIsFocused();

  const [permissionStatus, setPermissionStatus] = React.useState<PermissionStatus | null>(null);
  const [flashMode, setFlashMode] = React.useState<FlashMode>(FlashMode.off);
  const [cameraType, setCameraType] = React.useState<CameraType>(CameraType.back);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [queue, setQueue] = React.useState<PendingScan[]>([]);
  const [snackbar, setSnackbar] = React.useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });
  const [overlayState, setOverlayState] = React.useState<OverlayState | null>(null);

  const overlayRetryRef = React.useRef<(() => void) | null>(null);
  const cameraRef = React.useRef<Camera | null>(null);
  const capturingRef = React.useRef(false);
  const currentStepRef = React.useRef<StepKey>('capture');
  const queueRef = React.useRef<PendingScan[]>([]);
  const processingQueueRef = React.useRef(false);

  const isOnline = React.useMemo(() => {
    if (!netInfo.isConnected) return false;
    if (netInfo.isInternetReachable === false) return false;
    return true;
  }, [netInfo.isConnected, netInfo.isInternetReachable]);

  const setQueueState = React.useCallback((items: PendingScan[]) => {
    queueRef.current = items;
    setQueue(items);
  }, []);

  const showSnackbar = React.useCallback((message: string) => {
    setSnackbar({ visible: true, message });
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
    },
    [],
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
        await addStoredResult({
          id: item.id,
          userId: item.userId,
          bucket: item.bucket,
          storagePath: item.storagePath,
          createdAt: item.createdAt,
          processedAt: Date.now(),
          response: analysis,
        });

        if (!options.ephemeral) {
          const nextQueue = await removePendingScan(item.id);
          setQueueState(nextQueue);
        }

        if (!options.skipDeletion) {
          await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => undefined);
        }

        finalizeSuccess(options.context);

        if (options.context === 'queue') {
          setTimeout(() => {
            hideOverlay();
          }, 1200);
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

        const queuedItem = await persistQueueItem({
          ...item,
          attempts: item.attempts + 1,
          lastError: message,
        });

        if (!options.ephemeral) {
          const nextQueue = await updatePendingScan(queuedItem.id, {
            attempts: queuedItem.attempts,
            lastError: queuedItem.lastError,
          });
          setQueueState(nextQueue);
        }

        overlayRetryRef.current = isOnline
          ? () => {
              hideOverlay();
              processScanItem(queuedItem, {
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
      removePendingScan,
      setOverlayState,
      setQueueState,
      showOverlay,
      updateOverlaySteps,
      updateStepStatus,
      uploadToSupabase,
      updatePendingScan,
    ],
  );

  const processQueue = React.useCallback(async () => {
    if (!isOnline) return;
    if (processingQueueRef.current) return;
    if (!queueRef.current.length) return;

    processingQueueRef.current = true;
    try {
      const pending = [...queueRef.current].sort((a, b) => a.createdAt - b.createdAt);
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

  React.useEffect(() => {
    if (isOnline && queueRef.current.length > 0) {
      processQueue().catch((error) => {
        if (__DEV__) {
          console.warn('Queue processing failed', error);
        }
      });
    }
  }, [isOnline, processQueue, queue.length]);

  const handleCapture = React.useCallback(async () => {
    if (!cameraRef.current || capturingRef.current) return;
    if (!userId) {
      showSnackbar('You must be signed in to capture scans.');
      return;
    }

    capturingRef.current = true;
    currentStepRef.current = 'capture';

    const steps = initialSteps();
    showOverlay({
      context: 'capture',
      title: 'Processing scan',
      message: 'Capturing image…',
      steps,
      dismissLabel: 'Close',
    });

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: true });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateStepStatus('capture', 'complete');
      currentStepRef.current = 'compress';
      updateStepStatus('compress', 'active');
      setOverlayState((prev) => (prev ? { ...prev, message: 'Optimizing image…' } : prev));

      const optimized = await compressImage(photo.uri);
      updateStepStatus('compress', 'complete');
      setOverlayState((prev) => (prev ? { ...prev, message: 'Preparing upload…' } : prev));

      const id = createUniqueId();
      const storagePath = `${BUCKET_NAME}/${userId}/${id}.jpg`;
      const metadata = {
        capturedAt: new Date().toISOString(),
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
        showSnackbar('Scan saved and will sync when back online.');
        overlayRetryRef.current = isOnline
          ? () => {
              hideOverlay();
              processScanItem(queuedItem, { context: 'capture', ephemeral: false, stepsInitialized: false }).catch(
                () => undefined,
              );
            }
          : null;
        return;
      }

      await processScanItem(baseItem, { context: 'capture', ephemeral: true, stepsInitialized: true, skipDeletion: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to capture scan. Please try again.';
      setOverlayState((prev) =>
        prev
          ? {
              ...prev,
              title: 'Capture failed',
              message,
              error: message,
            }
          : prev,
      );
      overlayRetryRef.current = () => hideOverlay();
    } finally {
      capturingRef.current = false;
    }
  }, [
    cameraRef,
    compressImage,
    hideOverlay,
    isOnline,
    persistQueueItem,
    processScanItem,
    setOverlayState,
    showOverlay,
    showSnackbar,
    updateOverlaySteps,
    updateStepStatus,
    userId,
  ]);

  const handlePermissionRequest = React.useCallback(async () => {
    const result = await Camera.requestCameraPermissionsAsync();
    setPermissionStatus(result.status);
    if (result.status !== 'granted') {
      showSnackbar('Camera permission is required to scan receipts.');
    }
  }, [showSnackbar]);

  const toggleFlash = React.useCallback(() => {
    setFlashMode((current) => (current === FlashMode.off ? FlashMode.on : FlashMode.off));
  }, []);

  const toggleCamera = React.useCallback(() => {
    setCameraType((current) => (current === CameraType.back ? CameraType.front : CameraType.back));
  }, []);

  const pendingCount = queue.length;

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
            style={[styles.captureButton, !cameraReady ? styles.captureButtonDisabled : null]}
            onPress={handleCapture}
            disabled={!cameraReady}
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={styles.spacer} />
        </View>
        <Text style={styles.helperText}>Align the UPI receipt within the frame before capturing.</Text>
      </View>

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
