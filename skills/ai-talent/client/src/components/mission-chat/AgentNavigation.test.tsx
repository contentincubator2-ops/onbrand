/**
 * AgentNavigation tests (vitest + @testing-library/react)
 * Run: npx vitest run
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentNavigation, { type Agent } from "./AgentNavigation";

const AGENTS: Agent[] = [
  { id: 1, name: "陳映婕", title: "品牌策略總監", avatar: "品", status: "online" },
  { id: 2, name: "郭書蓉", title: "業務發展總監", avatar: "業", status: "busy" },
  { id: 3, name: "楊庭志", title: "供應鏈顧問",   avatar: "供", status: "offline" },
];

function setup(overrides?: Partial<React.ComponentProps<typeof AgentNavigation>>) {
  const onSelect = vi.fn();
  const onModuleChange = vi.fn();
  render(
    <AgentNavigation
      agents={AGENTS}
      activeId={1}
      onSelect={onSelect}
      activeModule="brand"
      onModuleChange={onModuleChange}
      {...overrides}
    />
  );
  return { onSelect, onModuleChange };
}

describe("AgentNavigation", () => {
  it("renders agent list", () => {
    setup();
    expect(screen.getByText("陳映婕")).toBeTruthy();
    expect(screen.getByText("郭書蓉")).toBeTruthy();
    expect(screen.getByText("楊庭志")).toBeTruthy();
  });

  it("filters by search query", () => {
    setup();
    const input = screen.getByPlaceholderText("搜尋 Agent…");
    fireEvent.change(input, { target: { value: "郭" } });
    expect(screen.getByText("郭書蓉")).toBeTruthy();
    expect(screen.queryByText("陳映婕")).toBeNull();
  });

  it("handles module switch", () => {
    const { onModuleChange } = setup();
    fireEvent.click(screen.getByText("內容生成"));
    expect(onModuleChange).toHaveBeenCalledWith("content");
  });

  it("calls onSelect on agent click", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByText("郭書蓉"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
