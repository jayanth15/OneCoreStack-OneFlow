"use client";

import { useState } from "react";
import { Download, X, Share, ShieldAlert, MonitorSmartphone } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

function DismissableBanner({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "warning";
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const bg = variant === "warning" ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" : "bg-primary/5 border-border";
  return (
    <div className={`flex items-start justify-between gap-2 px-4 py-2.5 border-b shrink-0 ${bg}`}>
      <p className="text-xs text-foreground flex items-start gap-1.5 flex-1">
        {children}
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded-md hover:bg-muted shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function TopBar() {
  const { canInstall, canPrompt, isIOS, isAndroidHTTP, needsCert, isManual, install } = usePwaInstall();

  if (!canInstall) return null;

  // Certificate not trusted or plain HTTP — user must go through /setup first
  if (needsCert || isAndroidHTTP) {
    const setupUrl = `http://${window.location.hostname}:3000/setup`;
    return (
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 shrink-0">
        <p className="text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 flex-1">
          <ShieldAlert className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <span>
            <strong>One-time setup required</strong> — to enable the Install App button,
            open{" "}
            <a href={setupUrl} className="font-bold underline text-amber-700 dark:text-amber-300">
              this setup page
            </a>
            {" "}on this device, install the certificate, then return here and reload.
            {needsCert && (
              <> <em className="block mt-1 not-italic text-amber-700 dark:text-amber-400">
                Note: Android 7+ requires the certificate to be installed as a <strong>System certificate</strong> (needs Developer Options or MDM). As a workaround, use Chrome menu ⋮ → <strong>Add to Home Screen</strong> on the HTTP port.
              </em></>
            )}
          </span>
        </p>
      </div>
    );
  }

  if (isIOS) {
    return (
      <DismissableBanner>
        <Share className="size-3.5 shrink-0 text-primary mt-0.5" />
        <span>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install OneFlow.</span>
      </DismissableBanner>
    );
  }

  if (canPrompt) {
    return (
      <div className="flex items-center justify-end gap-2 px-4 h-11 border-b bg-background shrink-0">
        <button
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Download className="size-3.5" />
          Install App
        </button>
      </div>
    );
  }

  // Secure context but beforeinstallprompt hasn't fired — show manual install hint
  if (isManual) {
    return (
      <DismissableBanner>
        <MonitorSmartphone className="size-3.5 shrink-0 text-primary mt-0.5" />
        <span>
          To install the app: tap the browser menu <strong>⋮</strong> (Android) or <strong>Share</strong> (iOS) →{" "}
          <strong>Add to Home Screen</strong> or <strong>Install App</strong>.
        </span>
      </DismissableBanner>
    );
  }

  return null;
}
