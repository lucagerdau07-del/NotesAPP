import { useEffect, useState } from "react";
import DocumentView from "./DocumentView";
import WritingZone from "./WritingZone";
import useInkDocument from "../hooks/useInkDocument";
import useFocusBox from "../hooks/useFocusBox";
import useDocumentSource from "../hooks/useDocumentSource";
import { resolvePageStyle } from "../documents/pageStyles.js";
import { browserNoteRepository } from "../storage/noteRepository.js";

export default function SplitLayout({
  activeTab,
  onBack,
  documentId: propDocumentId,
  note,
  railSlot,
  onPageCountChange,
  onCurrentPageChange,
  isImmersive,
  inkControllerRef,
  imageDropRequest,
  onImageDropHandled,
  onCircleToSearch,
}) {
  const documentId = String(note?.id ?? propDocumentId ?? "default");
  const initialPageIds =
    note?.kind === "imported" && Array.isArray(note.pages)
      ? note.pages.map((page) => page.id)
      : undefined;
  const [isEraser, setIsEraser] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showPageBreaks, setShowPageBreaks] = useState(true);
  const [layoutMode, setLayoutMode] = useState("full"); // 'full' | 'split'
  const resolvedNoteStyle =
    !note || note?.kind === "imported" ? undefined : resolvePageStyle(note);
  const initialPageStyle = resolvedNoteStyle;
  const initialInkColor = resolvedNoteStyle?.inkColor;
  const inkController = useInkDocument({
    documentId,
    initialPageIds,
    initialPageStyle,
    initialColor: initialInkColor,
    onPersisted:
      note?.kind === "imported"
        ? undefined
        : () => browserNoteRepository.touchNote(documentId),
  });
  const [paperStyle, setPaperStyle] = useState(
    () => inkController.document.pages[0]?.ruling || "lined",
  );
  const {
    sourceHandle,
    loading: sourceLoading,
    error: sourceError,
    retry: retrySource,
  } = useDocumentSource({ note });

  // The chat panel lives up in App (it is a child of the glass rail), but its
  // agent tools write to this document. A ref rather than a state callback:
  // the controller object is new on every render, so lifting it as state would
  // re-render this tree on every render of it.
  // paperStyle isn't part of inkController (it's local UI state, not document
  // state), but the agent's tools need it to snap text onto the page's ruling.
  if (inkControllerRef) inkControllerRef.current = { ...inkController, paperStyle };

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

  const pagesCount = inkController.document.pages.length;
  useEffect(() => {
    onPageCountChange?.(pagesCount);
  }, [pagesCount, onPageCountChange]);

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
          railSlot={railSlot}
          onCurrentPageChange={onCurrentPageChange}
          isImmersive={isImmersive}
          imageDropRequest={imageDropRequest}
          onImageDropHandled={onImageDropHandled}
          onCircleToSearch={onCircleToSearch}
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
