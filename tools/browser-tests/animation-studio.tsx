import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, Background, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimationStudio } from "../../src/components/animation-studio/AnimationStudio";
import { useAnimationStudio } from "../../src/lib/animation-studio/store";
import { useDesignStore } from "../../src/store/design-store";

useAnimationStudio.getState().setEnabled(true);
Object.assign(window, { studio: useAnimationStudio, designs: useDesignStore });

function Harness() {
  const boardRef = useRef<HTMLDivElement>(null);
  const [clicks, setClicks] = useState(0);
  const [text, setText] = useState("");
  const [nodes, , onNodesChange] = useNodesState([
    {
      id: "1",
      position: { x: 80, y: 100 },
      data: { label: "Large Chemical Reactor" },
      style: {
        background: "#223447",
        color: "#d1e8ef",
        border: "1px solid #417a8c",
        width: 210,
        height: 100,
      },
    },
    {
      id: "2",
      position: { x: 450, y: 100 },
      data: { label: "Distillation Tower" },
      style: {
        background: "#223447",
        color: "#d1e8ef",
        border: "1px solid #417a8c",
        width: 210,
        height: 100,
      },
    },
    {
      id: "3",
      position: { x: 450, y: 330 },
      data: { label: "Product drawer" },
      style: {
        background: "#264536",
        color: "#c7f1d8",
        border: "1px solid #55a36f",
        width: 210,
        height: 70,
      },
    },
  ]);
  return (
    <div
      style={{ fontFamily: "system-ui", color: "#cbd5e1", height: "100vh", background: "#101820" }}
    >
      <header
        style={{
          height: 54,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          background: "#1a2430",
        }}
      >
        <strong>GTNH Factory Flow</strong>
        <span style={{ color: "#70869a" }}>Animation studio interaction fixture</span>
        <button id="test-open" onClick={() => useAnimationStudio.getState().setEnabled(true)}>
          Open studio
        </button>
      </header>
      <div style={{ display: "flex", height: "calc(100vh - 54px)" }}>
        <aside style={{ width: 230, padding: 20 }}>
          <button id="test-click" onClick={() => setClicks((c) => c + 1)}>
            Test action
          </button>
          <div id="click-count">{clicks}</div>
          <input
            id="test-input"
            aria-label="Fixture text"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div
            id="test-scroll"
            style={{ overflow: "auto", height: 130, marginTop: 20, border: "1px solid #456" }}
          >
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i} style={{ padding: 8 }}>
                Resource {i}
              </div>
            ))}
          </div>
        </aside>
        <div
          ref={boardRef}
          className="factory-flow-board"
          style={{ flex: 1, minWidth: 0, position: "relative" }}
        >
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={[
              { id: "a", source: "1", target: "2" },
              { id: "b", source: "2", target: "3" },
            ]}
            defaultViewport={{ x: 30, y: 10, zoom: 1 }}
            minZoom={0.05}
            maxZoom={2.1}
          >
            <Background color="#43515e" />
            <AnimationStudio boardRef={boardRef} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
