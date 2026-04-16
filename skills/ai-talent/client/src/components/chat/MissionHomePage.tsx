import React, { useState } from "react";
import { WORKSPACE_SQUADS, type SquadOption } from "../../data/taskSquads";

interface MissionHomePageProps {
    workspace?: string;
    missionTitle?: string;
    onTaskSelect?: (task: string) => void;
    onSquadPreview?: (squad: SquadOption | null, allSquads: SquadOption[]) => void;
}

export const MissionHomePage: React.FC<MissionHomePageProps> = ({
    workspace = "strategy",
    missionTitle,
    onTaskSelect,
    onSquadPreview,
}) => {
    const [inputValue, setInputValue] = useState("");
    const [selectedSquad, setSelectedSquad] = useState<SquadOption | null>(null);

    const squads = WORKSPACE_SQUADS[workspace] ?? [];
    const shortTitle = missionTitle ? missionTitle.slice(0, 10) : "";
    const titleText = `${shortTitle} 啟動任務`;

    const handleSubmit = () => {
        if (inputValue.trim() && onTaskSelect) {
            onTaskSelect(inputValue.trim());
            setInputValue("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                overflowY: "auto",
                padding: "40px 20px 80px",
                background: "#FFFFFF",
            }}
        >
            {/* Title */}
            <div style={{ maxWidth: 600, textAlign: "center", marginBottom: 28 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: "#1A1A18" }}>
                    {titleText}
                </div>
            </div>

            {/* Input */}
            <div
                style={{
                    width: "100%",
                    maxWidth: 620,
                    background: "#F9F9F8",
                    border: "1.5px solid #E2E8F0",
                    borderRadius: 16,
                    padding: "14px 16px 10px",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    marginBottom: 12,
                }}
            >
                <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="描述你的任務需求..."
                    rows={2}
                    style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        resize: "none",
                        fontSize: 14,
                        color: "#1A1A18",
                        lineHeight: 1.6,
                        background: "transparent",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                    }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                        onClick={handleSubmit}
                        disabled={!inputValue.trim()}
                        style={{
                            background: inputValue.trim() ? "#1A1A18" : "#E8EAF0",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: 10,
                            padding: "8px 16px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: inputValue.trim() ? "pointer" : "not-allowed",
                            transition: "background 0.2s",
                            whiteSpace: "nowrap",
                        }}
                    >
                        啟動任務 →
                    </button>
                </div>
            </div>

            {/* Squad chips */}
            {squads.length > 0 && (
                <div
                    style={{
                        maxWidth: 620,
                        width: "100%",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        justifyContent: "center",
                    }}
                >
                    {squads.map((squad) => {
                        const isSelected = selectedSquad?.squadSlug === squad.squadSlug;
                        return (
                            <button
                                key={squad.squadSlug}
                                onClick={() => {
                                    const next = isSelected ? null : squad;
                                    setSelectedSquad(next);
                                    onSquadPreview?.(next, squads);
                                }}
                                style={{
                                    borderRadius: 20,
                                    padding: "5px 12px",
                                    fontSize: 12,
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    border: isSelected ? "1px solid #1A1A18" : "1px solid #E4E3E1",
                                    background: isSelected ? "#1A1A18" : "#FFFFFF",
                                    color: isSelected ? "#FFFFFF" : "#6B6A66",
                                    transition: "all 0.15s",
                                    fontFamily: "inherit",
                                }}
                            >
                                {squad.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
