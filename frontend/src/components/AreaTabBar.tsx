"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiPlus, mdiPencilOutline, mdiDeleteOutline, mdiCog } from "@mdi/js";
import { useAreaStore, type Area } from "@/store/areaStore";
import { useCanvasStore } from "@/store/canvasStore";
import { API_URL as API } from "@/lib/api";
import { AreaDeleteModal } from "./AreaDeleteModal";

interface AreaTabBarProps {
  isMobile?: boolean;
  onToggleSettings?: () => void;
  showSettings?: boolean;
  onAddBot?: () => void;
}

export function AreaTabBar({ isMobile, onToggleSettings, showSettings, onAddBot }: AreaTabBarProps) {
  const areas = useAreaStore((s) => s.areas);
  const activeAreaId = useAreaStore((s) => s.activeAreaId);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; area: Area } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteModal, setDeleteModal] = useState<Area | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTabClick = useCallback((areaId: string) => {
    if (areaId === activeAreaId) return;
    useCanvasStore.getState().resetForAreaSwitch();
    useAreaStore.getState().setActiveAreaId(areaId);
  }, [activeAreaId]);

  const handleAddArea = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Area" }),
      });
      if (!res.ok) return;
      const area = await res.json();
      useAreaStore.getState().addArea(area);
      useCanvasStore.getState().resetForAreaSwitch();
      useAreaStore.getState().setActiveAreaId(area.id);
      // Start editing the name immediately
      setEditingId(area.id);
      setEditingName(area.name);
    } catch (error) {
      console.warn("Failed to create area:", error);
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, area: Area) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, area });
  }, []);

  const handleDoubleClick = useCallback((area: Area) => {
    setEditingId(area.id);
    setEditingName(area.name);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!editingId || !editingName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const res = await fetch(`${API}/api/areas/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      if (res.ok) {
        useAreaStore.getState().updateArea(editingId, { name: editingName.trim() });
      }
    } catch (error) {
      console.warn("Failed to rename area:", error);
    }
    setEditingId(null);
  }, [editingId, editingName]);

  const handleDelete = useCallback(async (area: Area, moveToAreaId: string) => {
    try {
      const res = await fetch(`${API}/api/areas/${area.id}?move_to=${moveToAreaId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        useAreaStore.getState().removeArea(area.id);
      }
    } catch (error) {
      console.warn("Failed to delete area:", error);
    }
    setDeleteModal(null);
  }, []);

  // Dismiss context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    window.addEventListener("click", dismiss);
    return () => window.removeEventListener("click", dismiss);
  }, [contextMenu]);

  // Focus input when editing
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const height = isMobile ? 36 : 32;

  return (
    <>
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            overflowX: "auto",
            scrollbarWidth: "none",
            gap: 0,
          }}
        >
          {areas.map((area) => {
            const isActive = area.id === activeAreaId;
            const isEditing = area.id === editingId;

            return (
              <div
                key={area.id}
                onClick={() => !isEditing && handleTabClick(area.id)}
                onContextMenu={(e) => handleContextMenu(e, area)}
                onDoubleClick={() => handleDoubleClick(area)}
                style={{
                  height,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  cursor: "pointer",
                  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "color 0.12s, border-color 0.12s",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.color = "var(--text-muted)";
                }}
              >
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      background: "var(--overlay-light)",
                      border: "1px solid var(--accent)",
                      borderRadius: 3,
                      padding: "1px 4px",
                      color: "var(--text)",
                      outline: "none",
                      width: Math.max(40, editingName.length * 7 + 16),
                    }}
                  />
                ) : (
                  area.name
                )}
              </div>
            );
          })}
        </div>

        {/* Add area button */}
        <button
          onClick={handleAddArea}
          title="New area"
          style={{
            height,
            width: height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            borderLeft: "1px solid var(--border)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-light)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon path={mdiPlus} size={0.6} color="var(--text-muted)" />
        </button>

        {/* Config & Add Bot buttons (desktop only) */}
        {onToggleSettings && (
          <button
            onClick={onToggleSettings}
            title="Default Config"
            style={{
              height,
              width: height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: showSettings ? "var(--accent)" : "transparent",
              border: "none",
              borderLeft: "1px solid var(--border)",
              cursor: "pointer",
              flexShrink: 0,
              color: showSettings ? "var(--text)" : "var(--text-muted)",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { if (!showSettings) e.currentTarget.style.background = "var(--overlay-light)"; }}
            onMouseLeave={(e) => { if (!showSettings) e.currentTarget.style.background = "transparent"; }}
          >
            <Icon path={mdiCog} size={0.6} />
          </button>
        )}
        {onAddBot && (
          <button
            onClick={onAddBot}
            title="Add Nanobot"
            style={{
              height,
              width: height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--accent)",
              border: "none",
              borderLeft: "1px solid var(--border)",
              cursor: "pointer",
              flexShrink: 0,
              color: "var(--text)",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            <Icon path={mdiPlus} size={0.7} />
          </button>
        )}
      </div>

      {/* Tab context menu */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 0",
            zIndex: 9999,
            minWidth: 120,
            boxShadow: "0 4px 16px var(--shadow-md)",
          }}
        >
          <button
            onClick={() => {
              handleDoubleClick(contextMenu.area);
              setContextMenu(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 12px",
              background: "transparent",
              border: "none",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: 11,
              textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-light)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Icon path={mdiPencilOutline} size={0.5} color="var(--text-muted)" />
            Rename
          </button>
          {areas.length > 1 && (
            <button
              onClick={() => {
                setDeleteModal(contextMenu.area);
                setContextMenu(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 12px",
                background: "transparent",
                border: "none",
                borderTop: "1px solid var(--border)",
                color: "var(--red)",
                cursor: "pointer",
                fontSize: 11,
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-light)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Icon path={mdiDeleteOutline} size={0.5} color="var(--red)" />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <AreaDeleteModal
          area={deleteModal}
          otherAreas={areas.filter((a) => a.id !== deleteModal.id)}
          onConfirm={(moveToId) => handleDelete(deleteModal, moveToId)}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </>
  );
}
