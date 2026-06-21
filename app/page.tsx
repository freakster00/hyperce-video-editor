import { SoraEditor } from "@/components/editor/sora-editor";
import { EditorProvider } from "@/lib/editor-state";

export default function Home() {
  return (
    <EditorProvider>
      <SoraEditor />
    </EditorProvider>
  );
}
