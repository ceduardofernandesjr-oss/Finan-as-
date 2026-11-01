"use client";
import { FinanceProvider } from "@/lib/store";
import { FormsProvider } from "@/components/forms/provider";
import { Shell } from "@/components/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FinanceProvider>
      <FormsProvider>
        <Shell>{children}</Shell>
      </FormsProvider>
    </FinanceProvider>
  );
}
