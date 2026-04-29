/**
 * StudioLayout — shared editorial chrome for all Decision AI Studio pages.
 *
 * Visual language: roll-up banner reference.
 *   - Thin top bar (logo word-mark · brand selector · user)
 *   - Hairline under-rule
 *   - Sub-nav row (Studio · Board · Calendar · Library)
 *   - Roomy white canvas, editorial typography, no emoji
 */

import React from "react";
import { Link, NavLink, useParams, useNavigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  title?: string;
  back?: { to: string; label: string };
  actions?: React.ReactNode;
  hideSubNav?: boolean;
}

export default function StudioLayout({
  children,
  title,
  back,
  actions,
  hideSubNav,
}: Props) {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const base = `/studio/${brandId}`;

  return (
    <div className="mos-scope min-h-screen">
      {/* Top bar */}
      <header className="border-b border-divider bg-white">
        <div className="max-w-[1440px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="mos-display text-[1rem] tracking-[0.02em] text-foreground">
              SOWORK
            </Link>
            <div className="h-4 w-px bg-divider" />
            <div className="text-meta uppercase text-default-500">Marketing&nbsp;OS&nbsp;/&nbsp;Decision&nbsp;AI</div>
          </div>
          <div className="flex items-center gap-4 text-meta text-foreground">
            <button
              onClick={() => navigate("/")}
              className="hover:text-foreground transition"
            >
              Exit Studio
            </button>
          </div>
        </div>
      </header>

      {/* Sub nav */}
      {!hideSubNav && (
        <nav className="border-b border-divider bg-white">
          <div className="max-w-[1440px] mx-auto px-8 flex items-center gap-8 h-11">
            <StudioTab to={`${base}/triage`} label="Diagnose" />
            <StudioTab to={`${base}/templates`} label="Templates" />
            <StudioTab to={`${base}/library`} label="My Library" />
            <StudioTab to={`${base}/board`} label="Task Board" />
            <StudioTab to={`${base}/calendar`} label="Calendar" />
          </div>
        </nav>
      )}

      {/* Page header */}
      {(title || back || actions) && (
        <div className="border-b border-divider bg-white">
          <div className="max-w-[1440px] mx-auto px-8 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {back && (
                <button
                  onClick={() => navigate(back.to)}
                  className="text-meta uppercase tracking-[0.18em] text-default-500 hover:text-foreground"
                >
                  ← {back.label}
                </button>
              )}
              {title && (
                <h1 className="mos-display text-[1.6rem] text-foreground">{title}</h1>
              )}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </div>
      )}

      {/* Canvas */}
      <main className="max-w-[1440px] mx-auto px-8 py-8">{children}</main>
    </div>
  );
}

function StudioTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "text-meta uppercase tracking-[0.16em] transition",
          isActive
            ? "text-foreground border-b-2 border-foreground h-11 flex items-center"
            : "text-default-500 hover:text-foreground h-11 flex items-center",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}
