import { useState } from "react";
import DocumentView from "./DocumentView";
import WritingZone from "./WritingZone";
import useInkDocument from "../hooks/useInkDocument";
import useFocusBox from "../hooks/useFocusBox";
import useDocumentSource from "../hooks/useDocumentSource";

export default function SplitLayout({
  activeTab,
  onBack,
  documentId: propDocumentId,
  note,
}) {
  const documentId = String(note?.id ?? propDocumentId ?? "default");
  const initialPageIds =
    note?.kind === "imported" && Array.isArray(note.pages)
      ? note.pages.map((page) => page.id)
      : undefined;
  const [isEraser, setIsEraser] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [paperStyle, setPaperStyle] = useState("lined");
  const [showPageBreaks, setShowPageBreaks] = useState(true);
  const [layoutMode, setLayoutMode] = useState("full"); // 'full' | 'split'
  const inkController = useInkDocument({ documentId, initialPageIds });
  const {
    sourceHandle,
    loading: sourceLoading,
    error: sourceError,
    retry: retrySource,
  } = useDocumentSource({ note });

  const toolState = {
    color: inkController.color,
    setColor: inkController.setColor,
    rawColor: inkController.color,
    tool: inkController.tool,
    setTool: inkController.setTool,
    isEraser,
    setIsEraser,
    lineWidth: inkController.penWidth,
    rawLineWidth: inkController.penWidth,
    setLineWidth: inkController.setPenWidth,
    eraserWidth: inkController.eraserWidth,
    setEraserWidth: inkController.setEraserWidth,
    isSelectMode,
    setIsSelectMode,
    paperStyle,
    setPaperStyle,
    showPageBreaks,
    setShowPageBreaks,
    layoutMode,
    setLayoutMode,
  };

  const focusBoxState = useFocusBox(
    inkController.document.pages.map((page) => page.id),
  );

  if (activeTab === "smartCanvas") {
    return (
      <div
        className={`split-layout ${layoutMode === "split" ? "" : "full-mode"}`}
      >
        <DocumentView
          note={note}
          sourceHandle={sourceHandle}
          sourceLoading={sourceLoading}
          sourceError={sourceError}
          retrySource={retrySource}
          inkController={inkController}
          toolState={toolState}
          focusBoxState={focusBoxState}
          toolbarState={toolState}
          onBack={onBack}
        />
        {layoutMode === "split" && (
          <WritingZone
            note={note}
            sourceHandle={sourceHandle}
            sourceLoading={sourceLoading}
            sourceError={sourceError}
            retrySource={retrySource}
            inkController={inkController}
            toolState={toolState}
            focusBoxState={focusBoxState}
            toolbarState={toolState}
          />
        )}
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
