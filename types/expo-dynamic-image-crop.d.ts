declare module "expo-dynamic-image-crop" {
  export type ImageData = {
    uri: string;
    width: number;
    height: number;
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
  };

  export function ImageEditor(props: ImageEditorProps): React.ReactElement | null;
}
