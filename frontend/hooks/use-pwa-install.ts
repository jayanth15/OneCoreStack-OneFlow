"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallKind =
  | "prompt"             // Chrome/Edge — native prompt available (trusted HTTPS)
  | "ios"                // iOS Safari — manual Share > Add to Home Screen
  | "android-http"       // Android Chrome over HTTP — redirect to /setup
  | "android-needs-cert" // Android Chrome over HTTPS but cert not trusted — redirect to /setup
  | "manual"             // Secure context but beforeinstallprompt hasn't fired — show browser-menu hint
  | null;                // already installed or no action available

export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installKind, setInstallKind] = useState<InstallKind>(null);

  useEffect(() => {
    // Already running as installed PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    const ua = navigator.userAgent;

    // iOS Safari (no install prompt API)
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as Window & { MSStream?: unknown }).MSStream &&
      /Safari/.test(ua) &&
      !/CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIOS) {
      setInstallKind("ios");
      return;
    }

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // window.isSecureContext is false for:
    //   - http:// on non-localhost
    //   - https:// with an untrusted cert (even after clicking "Proceed anyway")
    // This is the most reliable way to detect whether Chrome will allow PWA install.
    const secureContext = window.isSecureContext;

    if (!secureContext && !isLocalhost) {
      // HTTP or uTrusted HTTPS — beforeinstallprompt will never fire
      const isHttps = window.location.protocol === "https:";
      setInstallKind(isHttps ? "android-needs-cert" : "android-http");
      return;
    }

    // Properly trusted HTTPS (or localhost) — wait for the native prompt
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setInstallKind("prompt");
    }

    function onAppInstalled() {
      setInstallKind(null);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);

    // Chrome sometimes never fires beforeinstallprompt even in a secure context
    // (already installed, engagement heuristics, criteria not met). After 4s,
    // fall back to showing a browser-menu hint so the user is never left with nothing.
    const fallbackTimer = setTimeout(() => {
      setInstallKind((current) => (current === null ? "manual" : current));
    }, 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      clearTimeout(fallbackTimer);
    };
  }, []);

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        setPrompt(null);
        setInstallKind(null);
      }
    }
  }

  const canInstall = installKind !== null;
  const canPrompt = installKind === "prompt";
  const isIOS = installKind === "ios";
  const isAndroidHTTP = installKind === "android-http";
  const needsCert = installKind === "android-needs-cert";
  const isManual = installKind === "manual";

  return { canInstall, canPrompt, isIOS, isAndroidHTTP, needsCert, isManual, install };
}
