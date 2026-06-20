"use client";

import { useState } from "react";
import type { Taxonomy } from "./types";
import { Composer } from "./Composer";
import { Configurations } from "./Configurations";

type Tab = "compose" | "manage";

export function SignalRoom({ taxonomy }: { taxonomy: Taxonomy }) {
  const [tab, setTab] = useState<Tab>("compose");

  return (
    <div>
      <nav className="mb-6 flex gap-2 border-b border-cream">
        <TabButton active={tab === "compose"} onClick={() => setTab("compose")}>
          Compose
        </TabButton>
        <TabButton active={tab === "manage"} onClick={() => setTab("manage")}>
          My configurations
        </TabButton>
      </nav>

      {tab === "compose" ? (
        <Composer taxonomy={taxonomy} onActivated={() => setTab("manage")} />
      ) : (
        <Configurations />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-b-2 border-gold text-forest"
          : "text-forest/60 hover:text-forest")
      }
    >
      {children}
    </button>
  );
}
