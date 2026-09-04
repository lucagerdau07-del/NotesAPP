import React, { useState, useMemo, useCallback } from "react";
import {
  X,
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  PenLine,
  Image as ImageIcon,
  Type,
  Square,
  Circle,
  ArrowRight,
  PaintBucket,
  Layers,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import "./LayerDrawer.css";

/**
 * Builds the visual list for the layer drawer (top-to-bottom).
 * Objects above inkLayerIndex are top-most, followed by the virtual ink layer,
 * followed by objects below inkLayerIndex.
 */
export function buildVisualList(objects = [], inkLayerIndex = 0, inkProps = {}) {
  const count = objects.length;
  const clampedIndex = Math.max(0, Math.min(count, inkLayerIndex ?? count));
  const below = objects.slice(0, clampedIndex);
  const above = objects.slice(clampedIndex);

  const inkItem = {
    id: "__ink__",
    type: "ink",
    text: "Handschrift & Striche",
    locked: inkProps.inkLayerLocked === true,
    hidden: inkProps.inkLayerHidden === true,
    strokeCount: inkProps.strokeCount ?? 0,
  };

  // Higher visual layers appear higher up in the list (reverse order of array)
  const visualAbove = [...above].reverse();
  const visualBelow = [...below].reverse();

  return [...visualAbove, inkItem, ...visualBelow];
}

/**
 * Converts a top-to-bottom visual list back to bottom-to-top object IDs and the inkLayerIndex.
 */
export function visualListToOrder(visualList) {
  const bottomToTop = [...visualList].reverse();
  const newObjectIds = [];
  let newInkLayerIndex = 0;

  for (const item of bottomToTop) {
    if (item.id === "__ink__" || item.type === "ink") {
      newInkLayerIndex = newObjectIds.length;
    } else {
      newObjectIds.push(item.id);
    }
  }

  return { newObjectIds, newInkLayerIndex };
}

function getItemIcon(item) {
  if (item.type === "ink") {
    return <PenLine size={16} className="layer-type-icon ink-icon" />;
  }
  if (item.type === "image") {
    if (item.src) {
      return <img src={item.src} alt="" className="layer-item-thumb" />;
    }
    return <ImageIcon size={16} className="layer-type-icon" />;
  }
  if (item.type === "shape") {
    if (item.shapeType === "circle") {
      return <Circle size={16} className="layer-type-icon" />;
    }
    if (item.shapeType === "arrow" || item.shapeType === "line") {
      return <ArrowRight size={16} className="layer-type-icon" />;
    }
    return <Square size={16} className="layer-type-icon" />;
  }
  if (item.type === "text") {
    return <Type size={16} className="layer-type-icon" />;
  }
  if (item.type === "fill") {
    return (
      <PaintBucket
        size={16}
        className="layer-type-icon"
        style={{ color: item.fillColor || "#f59e0b" }}
      />
    );
  }
  return <Layers size={16} className="layer-type-icon" />;
}

function getItemLabel(item) {
  if (item.type === "ink") {
    return "Handschrift & Striche";
  }
  if (item.text) {
    return item.text.length > 25 ? `${item.text.slice(0, 25)}…` : item.text;
  }
  if (item.name) {
    return item.name;
  }
  if (item.type === "image") {
    return "Bild";
  }
  if (item.type === "shape") {
    if (item.shapeType === "circle") return "Kreis";
    if (item.shapeType === "arrow") return "Pfeil";
    if (item.shapeType === "line") return "Linie";
    return "Rechteck";
  }
  if (item.type === "fill") {
    return "Hintergrund-Füllung";
  }
  return item.type || "Ebene";
}

export default function LayerDrawer({
  isOpen,
  objects = [],
  inkLayerIndex = 0,
  inkLayerHidden = false,
  inkLayerLocked = false,
  strokeCount = 0,
  selectedObjectId = null,
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onReorder,
  onClose,
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const visualLayers = useMemo(
    () =>
      buildVisualList(objects, inkLayerIndex, {
        inkLayerHidden,
        inkLayerLocked,
        strokeCount,
      }),
    [objects, inkLayerIndex, inkLayerHidden, inkLayerLocked, strokeCount]
  );

  const handleMove = useCallback(
    (currentIndex, targetIndex) => {
      if (
        currentIndex < 0 ||
        currentIndex >= visualLayers.length ||
        targetIndex < 0 ||
        targetIndex >= visualLayers.length ||
        currentIndex === targetIndex
      ) {
        return;
      }
      const updated = [...visualLayers];
      const [moved] = updated.splice(currentIndex, 1);
      updated.splice(targetIndex, 0, moved);
      const { newObjectIds, newInkLayerIndex } = visualListToOrder(updated);
      onReorder?.(newObjectIds, newInkLayerIndex);
    },
    [visualLayers, onReorder]
  );

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      handleMove(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (!isOpen) return null;

  const totalLayersCount = objects.length + 1; // objects + ink layer

  return (
    <aside
      className="canva-layer-drawer"
      data-testid="layer-drawer"
      aria-label="Ebenen-Verwaltung"
    >
      <div className="layer-drawer-header">
        <div className="layer-drawer-title-group">
          <Layers size={18} className="layer-drawer-header-icon" />
          <h3 className="layer-drawer-title">Ebenen</h3>
          <span className="layer-drawer-badge">{totalLayersCount}</span>
        </div>
        <button
          type="button"
          className="layer-drawer-close-btn"
          onClick={onClose}
          title="Schließen"
          aria-label="Schließen"
        >
          <X size={18} />
        </button>
      </div>

      <div className="layer-drawer-scroll-area">
        <div className="layer-drawer-list" role="list">
          {visualLayers.map((layer, index) => {
            const isInk = layer.id === "__ink__" || layer.type === "ink";
            const isSelected = isInk
              ? selectedObjectId === "__ink__"
              : selectedObjectId === layer.id;
            const isLocked = isInk ? inkLayerLocked : layer.locked === true;
            const isHidden = isInk ? inkLayerHidden : layer.hidden === true;
            const isDragging = draggedIndex === index;
            const isDropTarget = dragOverIndex === index;

            return (
              <div
                key={layer.id}
                role="listitem"
                data-testid="layer-item"
                data-layer-id={layer.id}
                className={`layer-drawer-item ${isSelected ? "selected" : ""} ${
                  isLocked ? "is-locked" : ""
                } ${isHidden ? "is-hidden" : ""} ${
                  isDragging ? "is-dragging" : ""
                } ${isDropTarget ? "is-drop-target" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  onSelect?.(layer.id);
                }}
              >
                <div
                  className="layer-item-grip"
                  title="Verschieben (ziehen)"
                  aria-label="Verschieben"
                >
                  <GripVertical size={16} />
                </div>

                <div className="layer-item-icon-wrapper">
                  {getItemIcon(layer)}
                </div>

                <div className="layer-item-info">
                  <span className="layer-item-label" title={getItemLabel(layer)}>
                    {getItemLabel(layer)}
                  </span>
                  {isInk ? (
                    <span className="layer-item-subtext">
                      {layer.strokeCount}{" "}
                      {layer.strokeCount === 1 ? "Strich" : "Striche"}
                    </span>
                  ) : null}
                </div>

                <div className="layer-item-controls" onClick={(e) => e.stopPropagation()}>
                  <div className="layer-item-step-buttons">
                    <button
                      type="button"
                      className="layer-step-btn"
                      title="Ebene nach oben"
                      disabled={index === 0}
                      onClick={() => handleMove(index, index - 1)}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="layer-step-btn"
                      title="Ebene nach unten"
                      disabled={index === visualLayers.length - 1}
                      onClick={() => handleMove(index, index + 1)}
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`layer-action-btn ${isHidden ? "active-off" : ""}`}
                    title={isHidden ? "Ebene einblenden" : "Ebene ausblenden"}
                    aria-label={isHidden ? "Ebene einblenden" : "Ebene ausblenden"}
                    onClick={() => {
                      onToggleVisibility?.(
                        isInk ? "ink" : "object",
                        isInk ? null : layer.id,
                        !isHidden
                      );
                    }}
                  >
                    {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>

                  <button
                    type="button"
                    className={`layer-action-btn ${isLocked ? "active-locked" : ""}`}
                    title={isLocked ? "Ebene entsperren" : "Ebene sperren"}
                    aria-label={isLocked ? "Ebene entsperren" : "Ebene sperren"}
                    onClick={() => {
                      onToggleLock?.(
                        isInk ? "ink" : "object",
                        isInk ? null : layer.id,
                        !isLocked
                      );
                    }}
                  >
                    {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
