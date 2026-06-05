import { manipulateAsync, SaveFormat, type ImageResult } from "expo-image-manipulator";
import { Feather } from "@expo/vector-icons";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ImageCropModal } from "./app/components/ImageCropModal";
import { probeVideoDisplayDimensions } from "./app/lib/videoDisplayDimensions";
import { keyboardScrollPadding } from "./app/lib/keyboardInputScroll";
import { useScrollPinnedInput } from "./app/lib/useScrollPinnedInput";
import { androidNavInset, photoEditorFooterPadding } from "./app/lib/safeAreaInsets";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import Slider from "@react-native-community/slider";
import { ResizeMode, Video } from "expo-av";

export type PhotoEditorTheme = {
  accent: string;
  background: string;
  text: string;
  subtleText: string;
  divider: string;
};

/** Normalized text-on-video (0–1 relative to video frame in the editor). */
export type VideoTextOverlayData = {
  id: string;
  text: string;
  color: string;
  relX: number;
  relY: number;
  relW: number;
  relH: number;
  relFontSize: number;
  fontFamily?: string;
  fontWeight?: "400" | "700";
  fontStyle?: "normal" | "italic";
};

export type PhotoEditorResult = {
  uri: string;
  width: number;
  height: number;
  caption: string;
  mediaKind: "photo" | "video";
  videoTextOverlays?: VideoTextOverlayData[];
};

type PhotoFilterId = "none" | "warm" | "cool" | "mono" | "sepia";

type Stroke = {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
};

type TextOverlay = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: "400" | "700";
  fontStyle?: "normal" | "italic";
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onComplete: (result: PhotoEditorResult) => void;
  assetUri: string | null;
  assetWidth: number;
  assetHeight: number;
  theme: PhotoEditorTheme;
  /** When `video`, only text overlays are available (same interaction as on photos). */
  mediaType?: "photo" | "video";
  /** Label for the final confirmation on the preview step (default: Post). */
  previewSubmitLabel?: string;
  /** Fired when crop UI opens or closes (Android hardware back can exit crop first). */
  onCropModeChange?: (active: boolean) => void;
  /** Increment to exit crop from the parent (hardware back). */
  cropExitTick?: number;
};

const FILTER_LABELS: { id: PhotoFilterId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "mono", label: "Mono" },
  { id: "sepia", label: "Sepia" },
];

/** Red, green, blue; yellow, magenta, cyan; black; white */
const PRESET_COLORS = [
  "#FF0000",
  "#00CC00",
  "#0066FF",
  "#FFFF00",
  "#FF00FF",
  "#00EEFF",
  "#000000",
  "#FFFFFF",
] as const;

const STROKE_WIDTHS = [2, 4, 6, 10];

function normalizeHex(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return "000000";
  return h.toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function isPresetColor(hex: string): boolean {
  const n = normalizeHex(hex);
  return PRESET_COLORS.some((p) => normalizeHex(p) === n);
}

function colorsMatch(a: string, b: string): boolean {
  return normalizeHex(a) === normalizeHex(b);
}

const FONT_OPTIONS: {
  id: string;
  label: string;
  fontFamily?: string;
  fontWeight?: "400" | "700";
  fontStyle?: "normal" | "italic";
}[] =
  Platform.OS === "ios"
    ? [
        { id: "sans", label: "Sans", fontWeight: "700" },
        { id: "serif", label: "Serif", fontFamily: "Georgia", fontWeight: "700" },
        { id: "mono", label: "Mono", fontFamily: "Courier", fontWeight: "700" },
        { id: "italic", label: "Italic", fontWeight: "700", fontStyle: "italic" },
      ]
    : [
        { id: "sans", label: "Sans", fontWeight: "700" },
        { id: "serif", label: "Serif", fontFamily: "serif", fontWeight: "700" },
        { id: "mono", label: "Mono", fontFamily: "monospace", fontWeight: "700" },
        { id: "italic", label: "Italic", fontWeight: "700", fontStyle: "italic" },
      ];

/**
 * `expo-image-manipulator` needs a local file path. Gallery picks on Android may return
 * `content://` — a no-op manipulate pass materializes a cache `file://` URI we can crop.
 */
async function ensureLocalManipulatorUri(uri: string): Promise<string> {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("file://") || trimmed.startsWith("/")) return trimmed;
  const materialized = await manipulateAsync(trimmed, [], {
    compress: 1,
    format: SaveFormat.JPEG,
  });
  return materialized.uri;
}

function buildPathD(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

type CropRect = { x: number; y: number; w: number; h: number };

const CROP_HANDLE = 24;
const MIN_CROP_SIDE = 56;

function clampCropRect(rect: CropRect, maxW: number, maxH: number): CropRect {
  const w = Math.max(MIN_CROP_SIDE, Math.min(rect.w, maxW));
  const h = Math.max(MIN_CROP_SIDE, Math.min(rect.h, maxH));
  return {
    x: Math.max(0, Math.min(rect.x, maxW - w)),
    y: Math.max(0, Math.min(rect.y, maxH - h)),
    w,
    h,
  };
}

function clampCropRectInFrame(
  rect: CropRect,
  frame: { x: number; y: number; w: number; h: number }
): CropRect {
  const inner = clampCropRect(
    { x: rect.x - frame.x, y: rect.y - frame.y, w: rect.w, h: rect.h },
    frame.w,
    frame.h
  );
  return { x: inner.x + frame.x, y: inner.y + frame.y, w: inner.w, h: inner.h };
}

/** Map on-screen crop box (letterboxed image frame) to source pixel crop for ImageManipulator. */
function cropRectToPixelCrop(
  rect: CropRect,
  frame: { x: number; y: number; w: number; h: number },
  imageW: number,
  imageH: number
): { originX: number; originY: number; width: number; height: number } {
  const relX = Math.max(0, Math.min(1, (rect.x - frame.x) / frame.w));
  const relY = Math.max(0, Math.min(1, (rect.y - frame.y) / frame.h));
  const relW = Math.max(0, Math.min(1 - relX, rect.w / frame.w));
  const relH = Math.max(0, Math.min(1 - relY, rect.h / frame.h));
  const width = Math.max(2, Math.round(relW * imageW));
  const height = Math.max(2, Math.round(relH * imageH));
  const originX = Math.max(0, Math.min(imageW - width, Math.round(relX * imageW)));
  const originY = Math.max(0, Math.min(imageH - height, Math.round(relY * imageH)));
  return { originX, originY, width, height };
}

function touchDistance(touches: ReadonlyArray<{ pageX: number; pageY: number }>): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.hypot(dx, dy);
}

function MulticolorCircleIcon({ size = 22 }: { size?: number }) {
  const h = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", flexDirection: "row", flexWrap: "wrap" }}>
      <View style={{ width: h, height: h, backgroundColor: "#E53935" }} />
      <View style={{ width: h, height: h, backgroundColor: "#FDD835" }} />
      <View style={{ width: h, height: h, backgroundColor: "#1E88E5" }} />
      <View style={{ width: h, height: h, backgroundColor: "#43A047" }} />
    </View>
  );
}

function IconToolButton({
  icon,
  label,
  active,
  disabled,
  onPress,
  accent,
  text,
  divider,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accent: string;
  text: string;
  divider: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        iconToolStyles.btn,
        { borderColor: divider },
        active && { borderColor: accent, backgroundColor: `${accent}12` },
        disabled && { opacity: 0.38 },
      ]}
    >
      <Feather name={icon} size={20} color={active ? accent : text} />
    </Pressable>
  );
}

const iconToolStyles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export function PhotoEditorModal({
  visible,
  onClose,
  onComplete,
  assetUri,
  assetWidth,
  assetHeight,
  theme,
  mediaType = "photo",
  previewSubmitLabel = "Post",
  onCropModeChange,
  cropExitTick = 0,
}: Props) {
  const isVideo = mediaType === "video";
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const exportRef = useRef<View>(null);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [workingUri, setWorkingUri] = useState(assetUri ?? "");
  const [naturalW, setNaturalW] = useState(assetWidth);
  const [naturalH, setNaturalH] = useState(assetHeight);
  const [filter, setFilter] = useState<PhotoFilterId>("none");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ points: { x: number; y: number }[] } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState<string>(PRESET_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [rgbPickerOpen, setRgbPickerOpen] = useState(false);
  const [rgbDraft, setRgbDraft] = useState({ r: 255, g: 0, b: 0 });
  const [paletteForText, setPaletteForText] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [textModalColor, setTextModalColor] = useState<string>(PRESET_COLORS[0]);
  const [textModalFontId, setTextModalFontId] = useState(FONT_OPTIONS[0].id);
  const [textModalFontSize, setTextModalFontSize] = useState(18);
  const [caption, setCaption] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [manipulating, setManipulating] = useState(false);
  const [filtersStripOpen, setFiltersStripOpen] = useState(false);
  const [externalCropVisible, setExternalCropVisible] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const previewScrollRef = useRef<ScrollView>(null);
  const captionInputRef = useRef<TextInput>(null);
  const [editorKeyboardHeight, setEditorKeyboardHeight] = useState(0);
  const editorKeyboardVisible = editorKeyboardHeight > 0;

  useEffect(() => {
    if (!visible) {
      setEditorKeyboardHeight(0);
      return;
    }
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setEditorKeyboardHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setEditorKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  const captionPin = useScrollPinnedInput({
    scrollRef: previewScrollRef,
    inputRef: captionInputRef,
    keyboardVisible: editorKeyboardVisible,
    keyboardHeight: editorKeyboardHeight,
    enabled: visible && step === "preview",
  });

  type EditorSnapshot = {
    workingUri: string;
    naturalW: number;
    naturalH: number;
    filter: PhotoFilterId;
    strokes: Stroke[];
    textOverlays: TextOverlay[];
  };

  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const restoringRef = useRef(false);
  const editorStateRef = useRef({
    workingUri: assetUri ?? "",
    naturalW: assetWidth,
    naturalH: assetHeight,
    filter: "none" as PhotoFilterId,
    strokes: [] as Stroke[],
    textOverlays: [] as TextOverlay[],
  });

  useEffect(() => {
    editorStateRef.current = { workingUri, naturalW, naturalH, filter, strokes, textOverlays };
  }, [workingUri, naturalW, naturalH, filter, strokes, textOverlays]);

  const cloneEditorSnapshot = useCallback(
    (s: typeof editorStateRef.current): EditorSnapshot => ({
      workingUri: s.workingUri,
      naturalW: s.naturalW,
      naturalH: s.naturalH,
      filter: s.filter,
      strokes: s.strokes.map((st) => ({
        ...st,
        points: st.points.map((p) => ({ ...p })),
      })),
      textOverlays: s.textOverlays.map((t) => ({ ...t })),
    }),
    []
  );

  const pushUndo = useCallback(() => {
    if (restoringRef.current) return;
    undoStackRef.current.push(cloneEditorSnapshot(editorStateRef.current));
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
    setCanUndo(true);
  }, [cloneEditorSnapshot]);

  const performUndo = useCallback(() => {
    const snap = undoStackRef.current.pop();
    if (!snap) {
      setCanUndo(false);
      return;
    }
    restoringRef.current = true;
    setWorkingUri(snap.workingUri);
    setNaturalW(snap.naturalW);
    setNaturalH(snap.naturalH);
    setFilter(snap.filter);
    setStrokes(snap.strokes);
    setTextOverlays(snap.textOverlays);
    setCurrentStroke(null);
    setSelectedTextId(null);
    restoringRef.current = false;
    setCanUndo(undoStackRef.current.length > 0);
  }, []);

  useEffect(() => {
    onCropModeChange?.(externalCropVisible);
  }, [externalCropVisible, onCropModeChange]);

  useEffect(() => {
    if (cropExitTick > 0) setExternalCropVisible(false);
  }, [cropExitTick]);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 100, h: 100 });
  const cropRectRef = useRef<CropRect>(cropRect);
  const cropPinchStartRef = useRef<{ distance: number; rect: CropRect } | null>(null);
  const [editToolsH, setEditToolsH] = useState(112);
  const footerBottomPad = photoEditorFooterPadding(insets.bottom);
  const navButtonStyle = theme.background.toLowerCase() === "#ffffff" ? "dark" : "light";

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    void NavigationBar.setVisibilityAsync("visible");
    void NavigationBar.setBackgroundColorAsync(theme.background);
    void NavigationBar.setButtonStyleAsync(navButtonStyle);
    void NavigationBar.setBorderColorAsync(theme.background).catch(() => undefined);
  }, [visible, theme.background, navButtonStyle]);

  useEffect(() => {
    if (!visible || !workingUri || isVideo) return;
    Image.getSize(
      workingUri,
      (w, h) => {
        if (w > 0 && h > 0) {
          setNaturalW(w);
          setNaturalH(h);
        }
      },
      () => undefined
    );
  }, [visible, workingUri, isVideo]);

  const { displayWidth, displayImgH } = useMemo(() => {
    const horizontalPad = 24;
    const maxW = Math.max(windowW - horizontalPad, 260);
    const headerReserve = 52;
    const footerReserve = 64 + footerBottomPad;
    const previewCaptionReserve = step === "preview" ? 88 : 0;
    const toolsReserve = step === "edit" ? editToolsH : 0;
    const availableH =
      windowH -
      insets.top -
      androidNavInset(insets.bottom) -
      headerReserve -
      footerReserve -
      toolsReserve -
      previewCaptionReserve -
      24;
    const maxImgH = Math.max(120, Math.min(availableH, 520));
    let imgH = 220;
    if (naturalW > 0 && naturalH > 0) {
      imgH = Math.round((maxW * naturalH) / naturalW);
    }
    imgH = Math.min(imgH, maxImgH);
    imgH = Math.max(120, imgH);
    return { displayWidth: maxW, displayImgH: imgH };
  }, [
    windowW,
    windowH,
    naturalW,
    naturalH,
    step,
    insets.top,
    insets.bottom,
    footerBottomPad,
    editToolsH,
    isVideo,
  ]);

  /** Letterboxed image bounds when using `contain` — crop maps to these pixels. */
  const imageFrame = useMemo(() => {
    if (naturalW <= 0 || naturalH <= 0) {
      return { x: 0, y: 0, w: displayWidth, h: displayImgH };
    }
    const scale = Math.min(displayWidth / naturalW, displayImgH / naturalH);
    const w = Math.round(naturalW * scale);
    const h = Math.round(naturalH * scale);
    return {
      x: Math.round((displayWidth - w) / 2),
      y: Math.round((displayImgH - h) / 2),
      w,
      h,
    };
  }, [naturalW, naturalH, displayWidth, displayImgH]);

  useEffect(() => {
    if (!visible) return;
    if (assetUri) {
      setWorkingUri(assetUri);
      if (assetWidth > 0 && assetHeight > 0) {
        setNaturalW(assetWidth);
        setNaturalH(assetHeight);
      } else {
        Image.getSize(
          assetUri,
          (w, h) => {
            setNaturalW(w);
            setNaturalH(h);
          },
          () => {
            setNaturalW(assetWidth || 1);
            setNaturalH(assetHeight || 1);
          }
        );
      }
    } else {
      setWorkingUri("");
      setNaturalW(0);
      setNaturalH(0);
    }
    setFilter("none");
    setStrokes([]);
    setCurrentStroke(null);
    setDrawMode(false);
    setTextOverlays([]);
    setSelectedTextId(null);
    setCaption("");
    setPreviewUri(null);
    setStep("edit");
    setTextDraft("");
    setTextModalOpen(false);
    setDrawColor(PRESET_COLORS[0]);
    setTextModalColor(PRESET_COLORS[0]);
    setRgbPickerOpen(false);
    setFiltersStripOpen(false);
    setExternalCropVisible(false);
    setCropMode(false);
    setManipulating(false);
    setTextModalFontId(FONT_OPTIONS[0].id);
    setTextModalFontSize(18);
    undoStackRef.current = [];
    setCanUndo(false);
  }, [visible, assetUri, assetWidth, assetHeight]);

  const filterOverlayStyle = useMemo(() => {
    switch (filter) {
      case "warm":
        return { backgroundColor: "rgba(255, 170, 90, 0.22)" };
      case "cool":
        return { backgroundColor: "rgba(70, 150, 255, 0.16)" };
      case "mono":
        return { backgroundColor: "rgba(40, 40, 40, 0.28)" };
      case "sepia":
        return { backgroundColor: "rgba(140, 100, 50, 0.22)" };
      default:
        return { backgroundColor: "transparent" };
    }
  }, [filter]);

  const applyWorking = useCallback(
    async (result: ImageResult) => {
      setWorkingUri(result.uri);
      setNaturalW(result.width);
      setNaturalH(result.height);
      setStrokes([]);
      setCurrentStroke(null);
      setTextOverlays([]);
    },
    []
  );

  const rotate90 = useCallback(async () => {
    if (!workingUri || manipulating) return;
    pushUndo();
    setManipulating(true);
    try {
      const localUri = await ensureLocalManipulatorUri(workingUri);
      const result = await manipulateAsync(localUri, [{ rotate: 90 }], {
        compress: 0.92,
        format: SaveFormat.JPEG,
      });
      await applyWorking(result);
      setCropMode(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      Alert.alert("Could not rotate", detail.slice(0, 120) || "Try again.");
    } finally {
      setManipulating(false);
    }
  }, [workingUri, manipulating, applyWorking, pushUndo]);

  const exitExclusiveTools = useCallback(() => {
    setCropMode(false);
    setDrawMode(false);
    setFiltersStripOpen(false);
    setExternalCropVisible(false);
    setSelectedTextId(null);
  }, []);

  const openExternalCrop = useCallback(() => {
    if (!workingUri || isVideo || manipulating) return;
    setDrawMode(false);
    setFiltersStripOpen(false);
    setSelectedTextId(null);
    setCropMode(false);
    setExternalCropVisible(true);
  }, [workingUri, isVideo, manipulating]);

  const handleExternalCropComplete = useCallback(
    async (data: { uri: string; width: number; height: number }) => {
      pushUndo();
      setWorkingUri(data.uri);
      setNaturalW(data.width);
      setNaturalH(data.height);
      setStrokes([]);
      setTextOverlays([]);
      setCurrentStroke(null);
      setSelectedTextId(null);
      setExternalCropVisible(false);
      setCropMode(false);
    },
    [pushUndo]
  );

  const enterCropMode = useCallback(() => {
    openExternalCrop();
  }, [openExternalCrop]);

  const applyCropFromDisplayRect = useCallback(async () => {
    if (!workingUri || manipulating) return;
    setManipulating(true);
    try {
      const localUri = await ensureLocalManipulatorUri(workingUri);
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(localUri, (width, height) => resolve({ width, height }), reject);
      });
      const w = dims.width;
      const h = dims.height;
      setNaturalW(w);
      setNaturalH(h);
      const rect = cropRectRef.current;
      const { originX, originY, width: cropW, height: cropH } = cropRectToPixelCrop(
        rect,
        imageFrame,
        w,
        h
      );
      const result = await manipulateAsync(
        localUri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { compress: 0.92, format: SaveFormat.JPEG }
      );
      await applyWorking(result);
      setCropMode(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      Alert.alert("Could not crop", detail.slice(0, 120) || "Try again.");
    } finally {
      setManipulating(false);
    }
  }, [workingUri, naturalW, naturalH, manipulating, applyWorking, imageFrame]);

  const updateCropRect = useCallback(
    (next: CropRect) => {
      const clamped = clampCropRectInFrame(next, imageFrame);
      cropRectRef.current = clamped;
      setCropRect(clamped);
    },
    [imageFrame]
  );

  const cropDragStartRef = useRef<CropRect | null>(null);
  const createCropCornerPan = (corner: "nw" | "ne" | "sw" | "se") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => cropMode,
      onMoveShouldSetPanResponder: () => cropMode,
      onPanResponderGrant: () => {
        cropDragStartRef.current = { ...cropRectRef.current };
      },
      onPanResponderMove: (_, gesture) => {
        const start = cropDragStartRef.current;
        if (!start) return;
        const dx = gesture.dx;
        const dy = gesture.dy;
        let next = { ...start };
        if (corner === "nw") {
          next = { x: start.x + dx, y: start.y + dy, w: start.w - dx, h: start.h - dy };
        } else if (corner === "ne") {
          next = { x: start.x, y: start.y + dy, w: start.w + dx, h: start.h - dy };
        } else if (corner === "sw") {
          next = { x: start.x + dx, y: start.y, w: start.w - dx, h: start.h + dy };
        } else {
          next = { x: start.x, y: start.y, w: start.w + dx, h: start.h + dy };
        }
        updateCropRect(next);
      },
      onPanResponderRelease: () => {
        cropDragStartRef.current = null;
      },
    });

  const cropMovePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => cropMode,
        onMoveShouldSetPanResponder: () => cropMode,
        onPanResponderGrant: () => {
          cropDragStartRef.current = { ...cropRectRef.current };
          cropPinchStartRef.current = null;
        },
        onPanResponderMove: (e, gesture) => {
          const touches = e.nativeEvent.touches ?? [];
          if (touches.length >= 2) {
            const dist = touchDistance(touches);
            if (!cropPinchStartRef.current) {
              cropPinchStartRef.current = { distance: dist, rect: cropRectRef.current };
              return;
            }
            const start = cropPinchStartRef.current;
            if (start.distance < 8) return;
            const scale = dist / start.distance;
            const cx = start.rect.x + start.rect.w / 2;
            const cy = start.rect.y + start.rect.h / 2;
            const nw = start.rect.w * scale;
            const nh = start.rect.h * scale;
            updateCropRect({
              x: cx - nw / 2,
              y: cy - nh / 2,
              w: nw,
              h: nh,
            });
            return;
          }
          cropPinchStartRef.current = null;
          const start = cropDragStartRef.current ?? cropRectRef.current;
          updateCropRect({
            ...start,
            x: start.x + gesture.dx,
            y: start.y + gesture.dy,
          });
        },
        onPanResponderRelease: () => {
          cropPinchStartRef.current = null;
          cropDragStartRef.current = null;
        },
      }),
    [cropMode, cropRect, updateCropRect]
  );

  const strokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const panResponderFixed = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => drawMode,
        onMoveShouldSetPanResponder: () => drawMode,
        onPanResponderGrant: (e) => {
          if (!drawMode) return;
          const { locationX, locationY } = e.nativeEvent;
          strokePointsRef.current = [{ x: locationX, y: locationY }];
          setCurrentStroke({ points: strokePointsRef.current });
        },
        onPanResponderMove: (e) => {
          if (!drawMode) return;
          const { locationX, locationY } = e.nativeEvent;
          strokePointsRef.current.push({ x: locationX, y: locationY });
          setCurrentStroke({ points: [...strokePointsRef.current] });
        },
        onPanResponderRelease: () => {
          if (!drawMode) {
            strokePointsRef.current = [];
            setCurrentStroke(null);
            return;
          }
          const pts = strokePointsRef.current;
          strokePointsRef.current = [];
          if (pts.length < 2) {
            setCurrentStroke(null);
            return;
          }
          const id = `s-${Date.now()}`;
          pushUndo();
          setStrokes((s) => [...s, { id, points: pts, color: drawColor, strokeWidth }]);
          setCurrentStroke(null);
        },
      }),
    [drawMode, drawColor, strokeWidth, pushUndo]
  );

  const runExportToPreview = useCallback(async () => {
    if (!workingUri) return;
    if (isVideo) {
      setPreviewUri(workingUri);
      setStep("preview");
      return;
    }
    if (!exportRef.current) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const uri = await captureRef(exportRef, {
        format: "png",
        quality: 0.92,
        result: "tmpfile",
      });
      setPreviewUri(uri);
      setStep("preview");
    } catch {
      Alert.alert("Export failed", "Could not prepare preview. Try again.");
    } finally {
      setExporting(false);
    }
  }, [workingUri, isVideo]);

  const confirmPost = useCallback(() => {
    if (!previewUri) return;
    if (isVideo) {
      const videoTextOverlays: VideoTextOverlayData[] = textOverlays.map((o) => ({
        id: o.id,
        text: o.text,
        color: o.color,
        relX: o.x / displayWidth,
        relY: o.y / displayImgH,
        relW: o.width / displayWidth,
        relH: o.height / displayImgH,
        relFontSize: o.fontSize / displayWidth,
        fontFamily: o.fontFamily,
        fontWeight: o.fontWeight,
        fontStyle: o.fontStyle,
      }));
      void probeVideoDisplayDimensions(previewUri).then((dims) => {
        onComplete({
          uri: previewUri,
          width: dims?.width ?? naturalW,
          height: dims?.height ?? naturalH,
          caption: caption.trim(),
          mediaKind: "video",
          videoTextOverlays,
        });
      });
      return;
    }
    Image.getSize(
      previewUri,
      (width, height) => {
        onComplete({
          uri: previewUri,
          width,
          height,
          caption: caption.trim(),
          mediaKind: "photo",
        });
      },
      () => {
        onComplete({
          uri: previewUri,
          width: naturalW,
          height: naturalH,
          caption: caption.trim(),
          mediaKind: "photo",
        });
      }
    );
  }, [
    previewUri,
    caption,
    naturalW,
    naturalH,
    onComplete,
    isVideo,
    textOverlays,
    displayWidth,
    displayImgH,
  ]);

  const applyRgb = useCallback(() => {
    const hex = rgbToHex(rgbDraft.r, rgbDraft.g, rgbDraft.b);
    if (paletteForText) setTextModalColor(hex);
    else setDrawColor(hex);
    setRgbPickerOpen(false);
  }, [rgbDraft, paletteForText]);

  const styles = useMemo(() => makeStyles(theme), [theme]);

  const fontOption = FONT_OPTIONS.find((f) => f.id === textModalFontId) ?? FONT_OPTIONS[0];

  const addTextOverlay = () => {
    const t = textDraft.trim();
    if (!t) return;
    pushUndo();
    const id = `t-${Date.now()}`;
    const w = Math.min(220, displayWidth - 24);
    const fs = textModalFontSize;
    const lineApprox = Math.ceil(t.length / 12);
    const h = Math.max(36, Math.min(displayImgH - 16, lineApprox * (fs * 1.2) + 8));
    setTextOverlays((list) => [
      ...list,
      {
        id,
        text: t,
        x: Math.max(8, (displayWidth - w) / 2),
        y: Math.max(8, displayImgH / 2 - h / 2),
        width: w,
        height: h,
        color: textModalColor,
        fontSize: fs,
        fontFamily: fontOption.fontFamily,
        fontWeight: fontOption.fontWeight,
        fontStyle: fontOption.fontStyle,
      },
    ]);
    setTextDraft("");
    setTextModalOpen(false);
    setSelectedTextId(id);
  };

  const textOverlaysRef = useRef(textOverlays);
  useEffect(() => {
    textOverlaysRef.current = textOverlays;
  }, [textOverlays]);

  const TEXT_HANDLE = 14;

  const dragStartRef = useRef({ ox: 0, oy: 0 });
  type EdgeKind = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
  const resizeEdgeRef = useRef<{
    x0: number;
    y0: number;
    w0: number;
    h0: number;
    fs0: number;
    edge: EdgeKind;
  } | null>(null);

  const createTextDragPan = (id: string) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !drawMode,
      onMoveShouldSetPanResponder: () => !drawMode,
      onPanResponderGrant: () => {
        pushUndo();
        setSelectedTextId(id);
        const o = textOverlaysRef.current.find((x) => x.id === id);
        dragStartRef.current = { ox: o?.x ?? 0, oy: o?.y ?? 0 };
      },
      onPanResponderMove: (_, g) => {
        setTextOverlays((list) => {
          const o = list.find((x) => x.id === id);
          if (!o) return list;
          const nx = dragStartRef.current.ox + g.dx;
          const ny = dragStartRef.current.oy + g.dy;
          const maxX = displayWidth - o.width;
          const maxY = displayImgH - o.height;
          return list.map((x) =>
            x.id === id
              ? {
                  ...x,
                  x: Math.max(0, Math.min(maxX, nx)),
                  y: Math.max(0, Math.min(maxY, ny)),
                }
              : x
          );
        });
      },
    });

  const createEdgeResizePan = (id: string, edge: EdgeKind) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !drawMode,
      onMoveShouldSetPanResponder: () => !drawMode,
      onPanResponderGrant: () => {
        pushUndo();
        setSelectedTextId(id);
        const o = textOverlaysRef.current.find((x) => x.id === id);
        if (!o) return;
        resizeEdgeRef.current = {
          x0: o.x,
          y0: o.y,
          w0: o.width,
          h0: o.height,
          fs0: o.fontSize,
          edge,
        };
      },
      onPanResponderMove: (_, g) => {
        const snap = resizeEdgeRef.current;
        if (!snap) return;
        const { x0, y0, w0, h0, fs0 } = snap;
        const dx = g.dx;
        const dy = g.dy;
        setTextOverlays((list) => {
          const o = list.find((x) => x.id === id);
          if (!o) return list;

          const clampFs = (n: number) => Math.round(Math.max(10, Math.min(44, n)));

          let nx = x0;
          let ny = y0;
          let nw = w0;
          let nh = h0;
          let nf = fs0;

          switch (edge) {
            case "e": {
              nw = Math.max(48, Math.min(displayWidth - x0, w0 + dx));
              nf = clampFs(fs0 * (nw / w0));
              break;
            }
            case "w": {
              nx = Math.max(0, x0 + dx);
              nw = Math.max(48, Math.min(displayWidth - nx, w0 - dx));
              nf = clampFs(fs0 * (nw / w0));
              break;
            }
            case "s": {
              nh = Math.max(28, Math.min(displayImgH - y0, h0 + dy));
              break;
            }
            case "n": {
              ny = Math.max(0, y0 + dy);
              nh = Math.max(28, Math.min(displayImgH - ny, h0 - dy));
              break;
            }
            case "se": {
              nw = Math.max(48, Math.min(displayWidth - x0, w0 + dx));
              nh = Math.max(28, Math.min(displayImgH - y0, h0 + dy));
              const scale = Math.sqrt((nw / w0) * (nh / h0));
              nf = clampFs(fs0 * scale);
              break;
            }
            case "sw": {
              nx = Math.max(0, x0 + dx);
              nw = Math.max(48, Math.min(displayWidth - nx, w0 - dx));
              nh = Math.max(28, Math.min(displayImgH - y0, h0 + dy));
              const scale = Math.sqrt((nw / w0) * (nh / h0));
              nf = clampFs(fs0 * scale);
              break;
            }
            case "ne": {
              nw = Math.max(48, Math.min(displayWidth - x0, w0 + dx));
              ny = Math.max(0, y0 + dy);
              nh = Math.max(28, Math.min(displayImgH - ny, h0 - dy));
              const scale = Math.sqrt((nw / w0) * (nh / h0));
              nf = clampFs(fs0 * scale);
              break;
            }
            case "nw": {
              nx = Math.max(0, x0 + dx);
              nw = Math.max(48, Math.min(displayWidth - nx, w0 - dx));
              ny = Math.max(0, y0 + dy);
              nh = Math.max(28, Math.min(displayImgH - ny, h0 - dy));
              const scale = Math.sqrt((nw / w0) * (nh / h0));
              nf = clampFs(fs0 * scale);
              break;
            }
            default:
              break;
          }

          return list.map((x) =>
            x.id === id ? { ...x, x: nx, y: ny, width: nw, height: nh, fontSize: nf } : x
          );
        });
      },
      onPanResponderRelease: () => {
        resizeEdgeRef.current = null;
      },
    });

  const editorCanvas = (
    <View style={styles.canvasWrap}>
      <View
        ref={exportRef}
        collapsable={false}
        style={[styles.exportBox, { width: displayWidth, height: displayImgH }]}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => {
            if (!drawMode) setSelectedTextId(null);
          }}
        >
          {workingUri ? (
            isVideo ? (
              <Video
                source={{ uri: workingUri }}
                style={{ width: displayWidth, height: displayImgH, backgroundColor: theme.divider }}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping={false}
                useNativeControls={false}
              />
            ) : (
              <Image
                source={{ uri: workingUri }}
                style={{
                  position: "absolute",
                  left: imageFrame.x,
                  top: imageFrame.y,
                  width: imageFrame.w,
                  height: imageFrame.h,
                  backgroundColor: theme.divider,
                }}
                resizeMode="cover"
              />
            )
          ) : (
            <View
              style={{
                width: displayWidth,
                height: displayImgH,
                backgroundColor: theme.divider,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          )}
        </Pressable>
        {!isVideo && filter !== "none" ? (
          <View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: imageFrame.x,
                top: imageFrame.y,
                width: imageFrame.w,
                height: imageFrame.h,
              },
              filterOverlayStyle,
            ]}
          />
        ) : null}
        <Svg
          width={displayWidth}
          height={displayImgH}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        >
          {strokes.map((s) => (
            <Path
              key={s.id}
              d={buildPathD(s.points)}
              stroke={s.color}
              strokeWidth={s.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {currentStroke && currentStroke.points.length > 1 ? (
            <Path
              d={buildPathD(currentStroke.points)}
              stroke={drawColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>
        {textOverlays.map((o) => {
          const dragPan = createTextDragPan(o.id);
          const selected = selectedTextId === o.id;
          const cx = (o.width - TEXT_HANDLE) / 2;
          const cy = (o.height - TEXT_HANDLE) / 2;
          const handleStyle = (pos: Record<string, number | string>) => ({
            position: "absolute" as const,
            zIndex: 4,
            ...pos,
            width: TEXT_HANDLE,
            height: TEXT_HANDLE,
            borderRadius: 3,
            backgroundColor: theme.accent,
            borderWidth: 1,
            borderColor: "#fff",
          });
          return (
            <View
              key={o.id}
              style={[
                {
                  position: "absolute",
                  left: o.x,
                  top: o.y,
                  width: o.width,
                  height: o.height,
                  zIndex: 2,
                  borderWidth: selected ? 2 : 0,
                  borderColor: theme.accent,
                  borderRadius: 6,
                },
              ]}
              pointerEvents={drawMode ? "none" : "auto"}
            >
              <Text
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: TEXT_HANDLE,
                  top: TEXT_HANDLE,
                  right: TEXT_HANDLE,
                  bottom: TEXT_HANDLE,
                  color: o.color,
                  fontSize: o.fontSize,
                  fontFamily: o.fontFamily,
                  fontWeight: o.fontWeight ?? "700",
                  fontStyle: o.fontStyle ?? "normal",
                  zIndex: 1,
                }}
              >
                {o.text}
              </Text>
              <View
                {...dragPan.panHandlers}
                style={{
                  position: "absolute",
                  left: TEXT_HANDLE,
                  top: TEXT_HANDLE,
                  right: TEXT_HANDLE,
                  bottom: TEXT_HANDLE,
                  zIndex: 2,
                }}
              />
              {selected && !drawMode ? (
                <>
                  <View {...createEdgeResizePan(o.id, "nw").panHandlers} style={handleStyle({ left: -TEXT_HANDLE / 2, top: -TEXT_HANDLE / 2 })} />
                  <View {...createEdgeResizePan(o.id, "n").panHandlers} style={handleStyle({ left: cx, top: -TEXT_HANDLE / 2 })} />
                  <View {...createEdgeResizePan(o.id, "ne").panHandlers} style={handleStyle({ right: -TEXT_HANDLE / 2, top: -TEXT_HANDLE / 2 })} />
                  <View {...createEdgeResizePan(o.id, "e").panHandlers} style={handleStyle({ right: -TEXT_HANDLE / 2, top: cy })} />
                  <View {...createEdgeResizePan(o.id, "se").panHandlers} style={handleStyle({ right: -TEXT_HANDLE / 2, bottom: -TEXT_HANDLE / 2 })} />
                  <View {...createEdgeResizePan(o.id, "s").panHandlers} style={handleStyle({ left: cx, bottom: -TEXT_HANDLE / 2 })} />
                  <View {...createEdgeResizePan(o.id, "sw").panHandlers} style={handleStyle({ left: -TEXT_HANDLE / 2, bottom: -TEXT_HANDLE / 2 })} />
                  <View {...createEdgeResizePan(o.id, "w").panHandlers} style={handleStyle({ left: -TEXT_HANDLE / 2, top: cy })} />
                </>
              ) : null}
            </View>
          );
        })}
        {!isVideo && drawMode ? (
          <View {...panResponderFixed.panHandlers} style={StyleSheet.absoluteFillObject} />
        ) : null}
        {cropMode && !isVideo ? (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <View
              pointerEvents="none"
              style={[styles.cropShade, { left: 0, top: 0, width: displayWidth, height: cropRect.y }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.cropShade,
                { left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.h },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.cropShade,
                {
                  left: cropRect.x + cropRect.w,
                  top: cropRect.y,
                  width: Math.max(0, displayWidth - cropRect.x - cropRect.w),
                  height: cropRect.h,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.cropShade,
                {
                  left: 0,
                  top: cropRect.y + cropRect.h,
                  width: displayWidth,
                  height: Math.max(0, displayImgH - cropRect.y - cropRect.h),
                },
              ]}
            />
            <View
              {...cropMovePan.panHandlers}
              style={[
                styles.cropFrame,
                {
                  left: cropRect.x,
                  top: cropRect.y,
                  width: cropRect.w,
                  height: cropRect.h,
                },
              ]}
            >
              <View {...createCropCornerPan("nw").panHandlers} style={[styles.cropHandle, styles.cropNw]} />
              <View {...createCropCornerPan("ne").panHandlers} style={[styles.cropHandle, styles.cropNe]} />
              <View {...createCropCornerPan("sw").panHandlers} style={[styles.cropHandle, styles.cropSw]} />
              <View {...createCropCornerPan("se").panHandlers} style={[styles.cropHandle, styles.cropSe]} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (externalCropVisible) {
          setExternalCropVisible(false);
          return;
        }
        onClose();
      }}
    >
      <StatusBar style={navButtonStyle === "light" ? "light" : "dark"} backgroundColor={theme.background} />
      <KeyboardAvoidingView
        style={[styles.shell, { paddingTop: insets.top + 8 }]}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 8}
      >
        {Platform.OS === "ios" ? (
          <InputAccessoryView nativeID="photoCaptionAccessory">
            <View style={styles.accessoryBar}>
              <Pressable
                style={styles.accessoryBarBtn}
                onPress={() => {
                  Keyboard.dismiss();
                }}
              >
                <Text style={styles.accessoryBarBtnText}>OK</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
        {Platform.OS === "ios" ? (
          <InputAccessoryView nativeID="photoTextOverlayAccessory">
            <View style={styles.accessoryBar}>
              <Pressable
                style={styles.accessoryBarBtn}
                onPress={() => {
                  Keyboard.dismiss();
                }}
              >
                <Text style={styles.accessoryBarBtnText}>OK</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
        <View style={styles.headerRow}>
          <Pressable onPress={onClose} style={styles.headerBtn} accessibilityLabel="Cancel">
            <Feather name="x" size={22} color={theme.accent} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {step === "edit" ? (isVideo ? "Edit video" : "Edit photo") : "Preview"}
          </Text>
          <View style={{ width: 64 }} />
        </View>

        {step === "edit" ? (
          <View style={styles.editStepColumn}>
            <View style={styles.editBody}>
              <View style={styles.editMain}>
                <View style={styles.canvasArea}>{editorCanvas}</View>

                <View style={styles.editToolsDock}>
                {isVideo ? (
                  <View style={styles.toolRow}>
                    <IconToolButton
                      icon="type"
                      label="Add text"
                      onPress={() => setTextModalOpen(true)}
                      accent={theme.accent}
                      text={theme.text}
                      divider={theme.divider}
                    />
                  </View>
                ) : (
                  <>
                    {filtersStripOpen ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.filterStripScroll}
                        contentContainerStyle={styles.filterStripContent}
                      >
                        {FILTER_LABELS.map((f) => {
                          const previewOverlay = (() => {
                            switch (f.id) {
                              case "warm":
                                return { backgroundColor: "rgba(255, 180, 80, 0.45)" };
                              case "cool":
                                return { backgroundColor: "rgba(80, 160, 255, 0.4)" };
                              case "mono":
                                return { backgroundColor: "rgba(128, 128, 128, 0.55)" };
                              case "sepia":
                                return { backgroundColor: "rgba(160, 120, 60, 0.5)" };
                              default:
                                return null;
                            }
                          })();
                          const selected = filter === f.id;
                          return (
                            <Pressable
                              key={f.id}
                              onPress={() => {
                                if (filter !== f.id) pushUndo();
                                setFilter(f.id);
                              }}
                              style={styles.filterStripItem}
                              accessibilityRole="button"
                              accessibilityLabel={`Filter ${f.label}`}
                            >
                              <View
                                style={[
                                  styles.filterStripLabelPill,
                                  selected && styles.filterStripLabelPillActive,
                                ]}
                              >
                                <Text style={styles.filterStripLabelText}>{f.label}</Text>
                              </View>
                              <View
                                style={[
                                  styles.filterStripThumb,
                                  { borderColor: selected ? theme.accent : theme.divider },
                                ]}
                              >
                                {previewOverlay ? (
                                  <View style={[StyleSheet.absoluteFill, previewOverlay]} />
                                ) : null}
                                <Feather
                                  name="image"
                                  size={18}
                                  color={selected ? theme.accent : theme.subtleText}
                                />
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : null}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.toolRowScroll}
                      contentContainerStyle={styles.toolRow}
                      onLayout={(e) => {
                        const h = Math.ceil(e.nativeEvent.layout.height);
                        if (h > 0 && h !== editToolsH) setEditToolsH(h);
                      }}
                    >
                      <IconToolButton
                        icon="sliders"
                        label="Filters"
                        active={filter !== "none" || filtersStripOpen}
                        onPress={() => {
                          setCropMode(false);
                          setDrawMode(false);
                          setExternalCropVisible(false);
                          setSelectedTextId(null);
                          setFiltersStripOpen((open) => !open);
                        }}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                      <IconToolButton
                        icon="refresh-cw"
                        label="Rotate"
                        onPress={() => {
                          exitExclusiveTools();
                          void rotate90();
                        }}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                      <IconToolButton
                        icon="crop"
                        label="Crop"
                        active={externalCropVisible}
                        onPress={openExternalCrop}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                      <IconToolButton
                        icon="edit-3"
                        label="Draw"
                        active={drawMode}
                        onPress={() => {
                          if (drawMode) {
                            setDrawMode(false);
                            return;
                          }
                          setCropMode(false);
                          setFiltersStripOpen(false);
                          setExternalCropVisible(false);
                          setSelectedTextId(null);
                          setDrawMode(true);
                        }}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                      <IconToolButton
                        icon="type"
                        label="Add text"
                        onPress={() => {
                          exitExclusiveTools();
                          setTextModalOpen(true);
                        }}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                      <IconToolButton
                        icon="rotate-ccw"
                        label="Undo"
                        disabled={!canUndo || manipulating || externalCropVisible}
                        onPress={performUndo}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                      <IconToolButton
                        icon="trash-2"
                        label="Clear overlays"
                        onPress={() => {
                          if (strokes.length > 0 || textOverlays.length > 0) pushUndo();
                          setStrokes([]);
                          setTextOverlays([]);
                          setCurrentStroke(null);
                          setSelectedTextId(null);
                        }}
                        accent={theme.accent}
                        text={theme.text}
                        divider={theme.divider}
                      />
                    </ScrollView>

                    {drawMode ? (
                      <>
                        <View style={styles.colorRow}>
                          {PRESET_COLORS.map((c) => (
                            <Pressable
                              key={c}
                              onPress={() => setDrawColor(c)}
                              style={[
                                styles.colorDot,
                                { backgroundColor: c },
                                colorsMatch(drawColor, c) && styles.colorDotActive,
                              ]}
                            />
                          ))}
                          <Pressable
                            style={[
                              styles.paletteTrigger,
                              !isPresetColor(drawColor) && styles.colorDotActive,
                            ]}
                            onPress={() => {
                              setPaletteForText(false);
                              setRgbDraft(hexToRgb(drawColor));
                              setRgbPickerOpen(true);
                            }}
                            accessibilityLabel="Custom color with red, green, and blue sliders"
                          >
                            <MulticolorCircleIcon size={24} />
                          </Pressable>
                        </View>
                        <View style={styles.strokeWidthRow}>
                          <Text style={styles.strokeLabel}>Width</Text>
                          {STROKE_WIDTHS.map((w) => (
                            <Pressable
                              key={w}
                              onPress={() => setStrokeWidth(w)}
                              style={[styles.strokeWidthBtn, strokeWidth === w && styles.strokeWidthBtnActive]}
                            >
                              <View
                                style={[
                                  styles.strokeWidthDot,
                                  { width: w + 6, height: w + 6, borderRadius: (w + 6) / 2 },
                                ]}
                              />
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}
                  </>
                )}
                </View>
              </View>
            </View>

            <SafeAreaView edges={["bottom"]} style={{ backgroundColor: theme.background }}>
              <View
                style={[
                  styles.stickyFooter,
                  {
                    paddingTop: 8,
                    paddingBottom: footerBottomPad,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <Pressable
                  style={[
                    styles.primaryWide,
                    styles.editFooterPrimary,
                    (exporting || !workingUri || manipulating) && styles.primaryWideDisabled,
                  ]}
                  onPress={() => void runExportToPreview()}
                  disabled={exporting || !workingUri || manipulating || externalCropVisible}
                  accessibilityLabel="Continue to preview"
                >
                  {exporting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryWideText}>Continue</Text>
                  )}
                </Pressable>
              </View>
            </SafeAreaView>
          </View>
        ) : (
          <View style={styles.previewBody}>
            <ScrollView
              ref={previewScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                paddingBottom: editorKeyboardVisible ? keyboardScrollPadding(editorKeyboardHeight, 8) : 8,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScroll={captionPin.onScroll}
              scrollEventThrottle={16}
            >
              <View style={styles.previewMain}>
                {previewUri ? (
                  <View
                    style={[
                      styles.previewMediaCard,
                      {
                        width: displayWidth,
                        borderColor: theme.divider,
                        backgroundColor: theme.background,
                      },
                    ]}
                  >
                    {isVideo ? (
                      <Video
                        source={{ uri: previewUri }}
                        style={[
                          styles.previewImageAttached,
                          { width: displayWidth, height: displayImgH, backgroundColor: theme.divider },
                        ]}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay
                        isLooping
                        useNativeControls
                      />
                    ) : (
                      <Image
                        source={{ uri: previewUri }}
                        style={[
                          styles.previewImageAttached,
                          { width: displayWidth, height: displayImgH, backgroundColor: theme.divider },
                        ]}
                        resizeMode="cover"
                      />
                    )}
                    <TextInput
                      ref={captionInputRef}
                      value={caption}
                      onChangeText={setCaption}
                      onFocus={captionPin.pinOnFocus}
                      placeholder={
                        isVideo ? "Add a caption for this video…" : "Add a caption for this photo…"
                      }
                      placeholderTextColor={theme.subtleText}
                      style={[
                        styles.captionInputAttached,
                        {
                          color: theme.text,
                          borderTopColor: theme.divider,
                          backgroundColor: theme.background,
                        },
                      ]}
                      multiline
                      maxLength={2000}
                      returnKeyType="done"
                      inputAccessoryViewID={Platform.OS === "ios" ? "photoCaptionAccessory" : undefined}
                    />
                  </View>
                ) : null}
              </View>
            </ScrollView>
            <SafeAreaView edges={["bottom"]} style={{ backgroundColor: theme.background }}>
              <View
                style={[
                  styles.stickyFooter,
                  styles.previewFooter,
                  {
                    paddingTop: 8,
                    paddingBottom: footerBottomPad,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <Pressable
                  style={styles.previewBackBtn}
                  onPress={() => setStep("edit")}
                  accessibilityLabel="Back to edit"
                >
                  <Text style={styles.previewBackBtnText}>Back</Text>
                </Pressable>
                <Pressable
                  style={styles.previewPostBtn}
                  onPress={confirmPost}
                  accessibilityLabel={previewSubmitLabel}
                >
                  <Text style={styles.previewPostBtnText}>{previewSubmitLabel}</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </View>
        )}

        <ImageCropModal
          visible={externalCropVisible}
          imageUri={workingUri || null}
          theme={theme}
          onComplete={handleExternalCropComplete}
          onCancel={() => setExternalCropVisible(false)}
        />

        <Modal visible={rgbPickerOpen} transparent animationType="fade" onRequestClose={() => setRgbPickerOpen(false)}>
          <Pressable style={styles.paletteOverlay} onPress={() => setRgbPickerOpen(false)}>
            <Pressable style={styles.rgbPickerCard} onPress={() => {}}>
              <Text style={styles.paletteTitle}>Custom color</Text>
              <Text style={styles.rgbPickerHint}>Adjust red, green, and blue</Text>
              <View
                style={[
                  styles.rgbPreviewSwatch,
                  { backgroundColor: rgbToHex(rgbDraft.r, rgbDraft.g, rgbDraft.b) },
                ]}
              />
              <ScrollView style={styles.rgbSliderScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.rgbSliderRow}>
                  <Text style={styles.rgbChannelLabel}>Red</Text>
                  <Slider
                    style={styles.rgbSlider}
                    minimumValue={0}
                    maximumValue={255}
                    step={1}
                    value={rgbDraft.r}
                    onValueChange={(v) => setRgbDraft((d) => ({ ...d, r: Math.round(v) }))}
                    minimumTrackTintColor="#E53935"
                    maximumTrackTintColor={theme.divider}
                    thumbTintColor={theme.accent}
                  />
                  <Text style={styles.rgbChannelValue}>{rgbDraft.r}</Text>
                </View>
                <View style={styles.rgbSliderRow}>
                  <Text style={styles.rgbChannelLabel}>Green</Text>
                  <Slider
                    style={styles.rgbSlider}
                    minimumValue={0}
                    maximumValue={255}
                    step={1}
                    value={rgbDraft.g}
                    onValueChange={(v) => setRgbDraft((d) => ({ ...d, g: Math.round(v) }))}
                    minimumTrackTintColor="#43A047"
                    maximumTrackTintColor={theme.divider}
                    thumbTintColor={theme.accent}
                  />
                  <Text style={styles.rgbChannelValue}>{rgbDraft.g}</Text>
                </View>
                <View style={styles.rgbSliderRow}>
                  <Text style={styles.rgbChannelLabel}>Blue</Text>
                  <Slider
                    style={styles.rgbSlider}
                    minimumValue={0}
                    maximumValue={255}
                    step={1}
                    value={rgbDraft.b}
                    onValueChange={(v) => setRgbDraft((d) => ({ ...d, b: Math.round(v) }))}
                    minimumTrackTintColor="#1E88E5"
                    maximumTrackTintColor={theme.divider}
                    thumbTintColor={theme.accent}
                  />
                  <Text style={styles.rgbChannelValue}>{rgbDraft.b}</Text>
                </View>
              </ScrollView>
              <Text style={styles.rgbHexLabel}>{rgbToHex(rgbDraft.r, rgbDraft.g, rgbDraft.b)}</Text>
              <View style={styles.rgbPickerActions}>
                <Pressable style={styles.rgbPickerSecondaryBtn} onPress={() => setRgbPickerOpen(false)}>
                  <Text style={styles.rgbPickerSecondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.rgbPickerPrimaryBtn} onPress={applyRgb}>
                  <Text style={styles.rgbPickerPrimaryBtnText}>Apply</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={textModalOpen} transparent animationType="fade">
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
            keyboardVerticalOffset={insets.top}
          >
            <View
              style={[
                styles.textModalOverlay,
                editorKeyboardVisible ? styles.textModalOverlayKeyboard : null,
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  styles.textModalScrollContent,
                  editorKeyboardVisible
                    ? { paddingBottom: keyboardScrollPadding(editorKeyboardHeight, 12) }
                    : null,
                ]}
              >
              <View style={styles.textModalCard}>
                <Text style={styles.textModalTitle}>Label on photo</Text>
                <TextInput
                  value={textDraft}
                  onChangeText={setTextDraft}
                  placeholder="Type text"
                  placeholderTextColor={theme.subtleText}
                  style={styles.textModalInput}
                  autoFocus
                  returnKeyType="done"
                  blurOnSubmit
                  inputAccessoryViewID={Platform.OS === "ios" ? "photoTextOverlayAccessory" : undefined}
                  onSubmitEditing={() => {
                    addTextOverlay();
                  }}
                />
                <Text style={styles.textModalSection}>Color</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalColorRow}>
                  {PRESET_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setTextModalColor(c)}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c },
                        colorsMatch(textModalColor, c) && styles.colorDotActive,
                      ]}
                    />
                  ))}
                  <Pressable
                    style={[
                      styles.paletteTrigger,
                      !isPresetColor(textModalColor) && styles.colorDotActive,
                    ]}
                    onPress={() => {
                      setPaletteForText(true);
                      setRgbDraft(hexToRgb(textModalColor));
                      setRgbPickerOpen(true);
                    }}
                    accessibilityLabel="Custom color with red, green, and blue sliders"
                  >
                    <MulticolorCircleIcon size={24} />
                  </Pressable>
                </ScrollView>
                <Text style={styles.textModalSection}>Font</Text>
                <View style={styles.fontRow}>
                  {FONT_OPTIONS.map((f) => (
                    <Pressable
                      key={f.id}
                      style={[styles.fontChip, textModalFontId === f.id && styles.fontChipActive]}
                      onPress={() => setTextModalFontId(f.id)}
                    >
                      <Text
                        style={[
                          styles.fontChipText,
                          textModalFontId === f.id && styles.fontChipTextActive,
                          f.fontFamily ? { fontFamily: f.fontFamily } : null,
                          f.fontStyle === "italic" ? { fontStyle: "italic" as const } : null,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.textModalSection}>Size ({textModalFontSize})</Text>
                <View style={styles.fontSizeRow}>
                  <Pressable style={styles.fontSizeBtn} onPress={() => setTextModalFontSize((s) => Math.max(10, s - 2))}>
                    <Text style={styles.fontSizeBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.fontSizeValue}>{textModalFontSize}</Text>
                  <Pressable style={styles.fontSizeBtn} onPress={() => setTextModalFontSize((s) => Math.min(44, s + 2))}>
                    <Text style={styles.fontSizeBtnText}>+</Text>
                  </Pressable>
                </View>
                <View style={styles.textModalActions}>
                  <Pressable style={styles.textModalActionBtnSecondary} onPress={() => setTextModalOpen(false)}>
                    <Text style={styles.textModalActionBtnSecondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.textModalActionBtnPrimary} onPress={addTextOverlay}>
                    <Text style={styles.textModalActionBtnPrimaryText}>Add</Text>
                  </Pressable>
                </View>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(theme: PhotoEditorTheme) {
  return StyleSheet.create({
    shell: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    headerBtn: { padding: 8 },
    headerBtnText: { color: theme.accent, fontSize: 16, fontWeight: "600" },
    headerTitle: { color: theme.text, fontSize: 17, fontWeight: "700" },
    editStepColumn: {
      flex: 1,
      minHeight: 0,
    },
    editBody: {
      flex: 1,
      minHeight: 0,
      paddingHorizontal: 16,
    },
    editMain: {
      flex: 1,
      minHeight: 0,
    },
    canvasArea: {
      flex: 1,
      minHeight: 0,
      justifyContent: "center",
    },
    editToolsDock: {
      paddingTop: 4,
    },
    editFooterPrimary: {
      marginTop: 0,
    },
    stickyFooter: {
      paddingTop: 8,
      backgroundColor: theme.background,
    },
    previewBody: {
      flex: 1,
      minHeight: 0,
      paddingHorizontal: 16,
    },
    previewMain: {
      flex: 1,
      minHeight: 0,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 4,
    },
    previewMediaCard: {
      alignSelf: "center",
      borderRadius: 0,
      borderWidth: 1,
      overflow: "hidden",
    },
    previewImageAttached: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    previewFooter: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 4,
      paddingHorizontal: 6,
      paddingTop: 6,
    },
    filterPickerCard: {
      borderRadius: 14,
      padding: 16,
      backgroundColor: theme.background,
      maxWidth: 420,
      width: "100%",
      alignSelf: "center",
    },
    filterPickerGrid: {
      gap: 8,
      marginBottom: 12,
    },
    previewBackBtn: {
      flex: 1,
      minHeight: 64,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.divider,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    previewBackBtnText: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
    },
    previewPostBtn: {
      flex: 1,
      minHeight: 64,
      borderRadius: 8,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    previewPostBtnText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
    },
    accessoryBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.divider,
      backgroundColor: theme.background,
    },
    accessoryBarBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    accessoryBarBtnText: {
      color: theme.accent,
      fontWeight: "700",
      fontSize: 17,
    },
    hint: {
      color: theme.accent,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 8,
      textAlign: "center",
    },
    canvasWrap: {
      alignItems: "center",
    },
    exportBox: {
      position: "relative",
      borderRadius: 0,
      overflow: "hidden",
    },
    cropShade: {
      position: "absolute",
      backgroundColor: "rgba(0,0,0,0.52)",
    },
    cropFrame: {
      position: "absolute",
      borderWidth: 2,
      borderColor: "#FFFFFF",
    },
    cropHandle: {
      position: "absolute",
      width: CROP_HANDLE,
      height: CROP_HANDLE,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: "#FFFFFF",
      backgroundColor: theme.accent,
    },
    cropNw: { left: -CROP_HANDLE / 2, top: -CROP_HANDLE / 2 },
    cropNe: { right: -CROP_HANDLE / 2, top: -CROP_HANDLE / 2 },
    cropSw: { left: -CROP_HANDLE / 2, bottom: -CROP_HANDLE / 2 },
    cropSe: { right: -CROP_HANDLE / 2, bottom: -CROP_HANDLE / 2 },
    cropFooterRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "stretch",
      paddingHorizontal: 10,
    },
    cropApplyBtn: {
      flex: 1,
      marginTop: 0,
      minHeight: 58,
    },
    sectionLabel: {
      color: theme.subtleText,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 6,
      textTransform: "uppercase",
    },
    chipRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
      paddingVertical: 4,
      alignItems: "center",
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      backgroundColor: theme.background,
      width: "100%",
    },
    filterChipActive: {
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}18`,
    },
    filterChipText: { color: theme.text, fontSize: 13, fontWeight: "600" },
    filterChipTextActive: { color: theme.accent, fontWeight: "700" },
    filterStripScroll: {
      marginBottom: 8,
      maxHeight: 88,
    },
    filterStripContent: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingHorizontal: 4,
    },
    filterStripItem: {
      alignItems: "center",
      width: 64,
    },
    filterStripLabelPill: {
      backgroundColor: "#000000",
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 6,
      minWidth: 52,
      alignItems: "center",
    },
    filterStripLabelPillActive: {
      borderWidth: 1,
      borderColor: theme.accent,
    },
    filterStripLabelText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    filterStripThumb: {
      width: 48,
      height: 48,
      borderRadius: 10,
      borderWidth: 1,
      backgroundColor: "#1A1A1A",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    toolRowScroll: {
      marginBottom: 8,
    },
    toolRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 4,
      alignItems: "center",
    },
    toolBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
    },
    toolBtnActive: {
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}12`,
    },
    toolBtnText: { color: theme.text, fontSize: 13, fontWeight: "600" },
    toolBtnTextActive: { color: theme.accent },
    colorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    paletteTrigger: {
      padding: 2,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "transparent",
    },
    strokeWidthRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 10,
      flexWrap: "wrap",
    },
    strokeLabel: {
      color: theme.subtleText,
      fontSize: 12,
      fontWeight: "600",
      marginRight: 4,
    },
    strokeWidthBtn: {
      padding: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.divider,
    },
    strokeWidthBtnActive: {
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}12`,
    },
    strokeWidthDot: {
      backgroundColor: theme.text,
      alignSelf: "center",
    },
    colorDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: theme.divider,
    },
    colorDotActive: {
      borderColor: theme.accent,
    },
    secondaryWide: {
      flex: 1,
      minHeight: 58,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryWideText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "600",
    },
    primaryWide: {
      marginTop: 0,
      minHeight: 58,
      borderRadius: 10,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },
    primaryWideDisabled: { opacity: 0.6 },
    primaryWideText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
    },
    /** Caption field visually attached to the preview image (single card). */
    captionInputAttached: {
      borderWidth: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomLeftRadius: 11,
      borderBottomRightRadius: 11,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      minHeight: 64,
      maxHeight: 140,
      textAlignVertical: "top",
    },
    textModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      padding: 24,
    },
    textModalOverlayKeyboard: {
      justifyContent: "flex-end",
      paddingBottom: 0,
    },
    textModalScrollContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    textModalCard: {
      borderRadius: 14,
      padding: 18,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.divider,
      gap: 8,
      maxHeight: Dimensions.get("window").height * 0.85,
    },
    textModalTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
    },
    textModalSection: {
      color: theme.subtleText,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      marginTop: 4,
    },
    textModalInput: {
      borderWidth: 1,
      borderColor: theme.divider,
      borderRadius: 10,
      padding: 10,
      color: theme.text,
      fontSize: 16,
    },
    modalColorRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      paddingVertical: 4,
    },
    fontRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    fontChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.divider,
    },
    fontChipActive: {
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}14`,
    },
    fontChipText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
    fontChipTextActive: {
      color: theme.accent,
    },
    fontSizeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      marginVertical: 4,
    },
    fontSizeBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      alignItems: "center",
      justifyContent: "center",
    },
    fontSizeBtnText: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "700",
    },
    fontSizeValue: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      minWidth: 36,
      textAlign: "center",
    },
    textModalActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 8,
      alignItems: "stretch",
    },
    textModalActionBtnSecondary: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    textModalActionBtnSecondaryText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
    },
    textModalActionBtnPrimary: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    textModalActionBtnPrimaryText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
    },
    paletteOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    rgbPickerCard: {
      borderRadius: 14,
      padding: 16,
      backgroundColor: theme.background,
      maxHeight: "88%",
      maxWidth: 420,
      width: "100%",
      alignSelf: "center",
    },
    paletteTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 4,
      textAlign: "center",
    },
    rgbPickerHint: {
      color: theme.subtleText,
      fontSize: 13,
      textAlign: "center",
      marginBottom: 12,
    },
    rgbPreviewSwatch: {
      height: 56,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      marginBottom: 8,
    },
    rgbSliderScroll: {
      maxHeight: 240,
    },
    rgbSliderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    rgbSlider: {
      flex: 1,
      height: 40,
    },
    rgbChannelLabel: {
      width: 48,
      color: theme.text,
      fontSize: 13,
      fontWeight: "600",
    },
    rgbChannelValue: {
      width: 34,
      textAlign: "right",
      color: theme.subtleText,
      fontSize: 13,
    },
    rgbHexLabel: {
      textAlign: "center",
      color: theme.subtleText,
      fontSize: 13,
      marginBottom: 14,
    },
    rgbPickerActions: {
      flexDirection: "row",
      gap: 10,
      alignItems: "stretch",
    },
    rgbPickerSecondaryBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.divider,
      backgroundColor: theme.background,
      alignItems: "center",
    },
    rgbPickerSecondaryBtnText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
    },
    rgbPickerPrimaryBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: theme.accent,
      alignItems: "center",
    },
    rgbPickerPrimaryBtnText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
    },
    primaryButton: {
      backgroundColor: theme.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 16,
    },
  });
}
