import type { ReactElement, ReactNode } from "react";

declare module "expo-dynamic-image-crop" {
  export type ImageData = {
    uri: string;
    width: number;
    height: number;
  };

  export type ControlBarActions = {
    onCancel: () => void;
    onCrop: () => Promise<void>;
    onSave: () => void;
    onBack: () => void;
    isEdit: boolean;
  };

  export type ImageEditorProps = {
    imageUri: string | null;
    isVisible?: boolean;
    onEditingComplete: (data: ImageData) => void;
    onEditingCancel: () => void;
    fixedAspectRatio?: number;
    dynamicCrop?: boolean;
    useModal?: boolean;
    editorOptions?: Record<string, unknown>;
    customControlBar?: (actions: ControlBarActions) => ReactNode;
  };

  export function ImageEditor(props: ImageEditorProps): ReactElement | null;
}
