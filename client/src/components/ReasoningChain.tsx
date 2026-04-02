/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Reasoning Chain
   Linear trace log and decision tree visualization wrapper
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useApp } from "@/lib/store";
import { useState, useMemo } from "react";

export default function ReasoningChain() {
  const { state } = useApp();
  const [viewMode, setViewMode] = useState<"log" | "tree">("tree");

  // Group reasoning steps logically
  const treeGroups = useMemo(() => {
    const groups: { taskId: string; taskName?: string; steps: typeof state.reasoningChain }[] = [];
    let currentGroupId = "";
    
    state.reasoningChain.forEach((step) => {
      const id = step.relatedTaskId || "global";
      
      if (groups.length === 0 || currentGroupId !== id) {
        currentGroupId = id;
        groups.push({
          taskId: id,
          taskName: state.tasks.find(t => t.id === id)?.name || "System Process",
          steps: []
        });
      }
      
      groups[groups.length - 1].steps.push(step);
    });

    return groups;
  }, [state.reasoningChain, state.tasks]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  return (
    <div>
      <div className="meta-text" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Complete Trace Log</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button 
            className="btn btn-sm" 
            style={{ fontWeight: viewMode === "log" ? 700 : 400, border: viewMode === "log" ? "1px solid var(--ink)" : "1px solid transparent", padding: "4px 8px" }}
            onClick={() => setViewMode("log")}
          >
            Linear
          </button>
          <button 
            className="btn btn-sm"
            style={{ fontWeight: viewMode === "tree" ? 700 : 400, border: viewMode === "tree" ? "1px solid var(--ink)" : "1px solid transparent", padding: "4px 8px" }}
            onClick={() => setViewMode("tree")}
          >
            Tree Vis
          </button>
        </div>
      </div>
      
      <h2 style={{ marginBottom: 24 }}>Reasoning Chain</h2>
      <p style={{ color: "var(--muted)", maxWidth: 400, marginBottom: 32 }}>
        Every scheduling decision traced to its exact rule. No inference, no black boxes.
      </p>

      <div className="trace-log">
        <div className="meta-text" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between" }}>
          <span>{state.reasoningChain.length} steps executed</span>
          {viewMode === "tree" && (
             <button 
               onClick={() => setExpandedGroups({})} 
               style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}
             >
               Collapse All
             </button>
          )}
        </div>

        {viewMode === "log" ? (
          state.reasoningChain.map((step) => {
            const isRelated =
              state.highlightedTaskId && step.relatedTaskId === state.highlightedTaskId;

            const lineClass = step.isConflict
              ? "log-line conflict"
              : step.isAction
                ? "log-line action"
                : step.isRule
                  ? "log-line rule"
                  : "log-line";

            return (
              <div
                key={step.number}
                className={lineClass}
                style={{
                  background: isRelated ? "rgba(192, 57, 43, 0.05)" : undefined,
                  marginBottom: 8
                }}
              >
                {step.number}. {step.isConflict && "[!] "}{step.text}
              </div>
            );
          })
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {treeGroups.map((group, gIdx) => {
              const isExpanded = !!expandedGroups[group.taskId];
              
              return (
                <div key={gIdx} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <button 
                    onClick={() => toggleGroup(group.taskId)}
                    style={{ 
                      fontWeight: 700, 
                      fontFamily: "var(--mono)", 
                      fontSize: 10, 
                      background: group.taskId === "global" ? "var(--rule)" : "var(--ink)", 
                      color: group.taskId === "global" ? "var(--ink)" : "var(--bg)",
                      display: "flex", 
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 10px", 
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      alignSelf: "flex-start",
                      border: "none",
                      cursor: "pointer"
                    }}
                  >
                    <span>{isExpanded ? "▼" : "▶"}</span>
                    <span>{group.taskId === "global" ? "[SYSTEM]" : `[EVALUATING] ${group.taskName}`}</span>
                  </button>
                  
                  {isExpanded && (
                    <div style={{ 
                      paddingLeft: 12, 
                      borderLeft: "0.5px dotted var(--ink)", 
                      marginLeft: 8, 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: 12 
                    }}>
                      {group.steps.map((step, sIdx) => {
                        const isRelated = state.highlightedTaskId && step.relatedTaskId === state.highlightedTaskId;
                        
                        return (
                          <div 
                            key={sIdx} 
                            style={{ 
                              position: "relative", 
                              paddingLeft: 24, 
                              background: isRelated ? "rgba(192, 57, 43, 0.05)" : undefined 
                            }}
                          >
                            <div style={{ position: "absolute", left: 0, top: 12, width: 20, borderTop: "0.5px dotted var(--ink)" }} />
                            <span style={{ 
                              color: step.isConflict ? "var(--vermillion)" : (step.isAction ? "var(--safe)" : (step.isRule ? "var(--ink)" : "var(--muted)")),
                              fontWeight: (step.isRule || step.isAction) ? 700 : 400,
                              fontSize: 12
                            }}>
                              {step.text.startsWith("EVALUATE:") ? (
                                <>
                                  <span style={{ fontFamily: "var(--mono)", opacity: 0.6 }}>{step.text.split("->")[0]} -&gt; </span>
                                  {step.isConflict ? (
                                     <span style={{ color: "var(--vermillion)", fontWeight: 700 }}>✕ {step.text.split("->")[1].trim()}</span>
                                  ) : (
                                     <span style={{ color: "var(--safe)", fontWeight: 700 }}>✓ {step.text.split("->")[1].trim()}</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  {step.isConflict && "⚠️ "}
                                  {step.isAction && "→ "}
                                  {step.text}
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      <div
        className="meta-text"
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          borderTop: "0.5px solid var(--rule)",
          paddingTop: 16,
        }}
      >
        <div>
          <div>Rules Applied</div>
          <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--ink)" }}>
            {state.reasoningChain.filter((s) => s.isRule).length}
          </div>
        </div>
        <div>
          <div>Actions Taken</div>
          <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--ink)" }}>
            {state.reasoningChain.filter((s) => s.isAction).length}
          </div>
        </div>
        <div>
          <div>Conflicts</div>
          <div style={{
            fontWeight: 700,
            fontSize: 20,
            marginTop: 4,
            color: state.reasoningChain.some((s) => s.isConflict) ? "var(--vermillion)" : "var(--ink)",
          }}>
            {state.reasoningChain.filter((s) => s.isConflict).length}
          </div>
        </div>
      </div>
    </div>
  );
}
