"use client";

import { useEffect, useState } from "react";

export default function PwaDebugPage() {
  const [info, setInfo] = useState<Record<string, string>>({});
  const [swState, setSwState] = useState("checking...");
  const [promptFired, setPromptFired] = useState(false);
  const [installable, setInstallable] = useState<boolean | null>(null);

  useEffect(() => {
    // Collect all relevant diagnostic info immediately
    const data: Record<string, string> = {
      "protocol": window.location.protocol,
      "hostname": window.location.hostname,
      "port": window.location.port || "(none — 80/443)",
      "isSecureContext": String(window.isSecureContext),
      "display-mode standalone": String(window.matchMedia("(display-mode: standalone)").matches),
      "navigator.standalone": String((navigator as { standalone?: boolean }).standalone),
      "userAgent": navigator.userAgent,
      "serviceWorker supported": String("serviceWorker" in navigator),
    };
    setInfo(data);

    // Check SW state
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration("/").then((reg) => {
        if (!reg) {
          setSwState("NOT registered");
          return;
        }
        const sw = reg.active || reg.installing || reg.waiting;
        setSwState(
          `registered — state: ${sw?.state ?? "unknown"} | scope: ${reg.scope}`
        );
      });
    } else {
      setSwState("NOT supported");
    }

    // Listen for beforeinstallprompt
    function onPrompt(e: Event) {
      e.preventDefault();
      setPromptFired(true);
      setInstallable(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);

    // If not fired after 5s, mark as not fired
    const timer = setTimeout(() => {
      setInstallable((v) => (v === null ? false : v));
    }, 5000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const Row = ({ label, value }: { label: string; value: string }) => {
    const isGood =
      (label === "isSecureContext" && value === "true") ||
      (label === "protocol" && value === "https:") ||
      (label === "serviceWorker supported" && value === "true");
    const isBad =
      (label === "isSecureContext" && value === "false") ||
      (label === "protocol" && value === "http:");
    return (
      <div
        className={`flex justify-between gap-4 px-3 py-2 rounded text-xs border ${
          isGood
            ? "bg-green-50 border-green-200 text-green-900"
            : isBad
            ? "bg-red-50 border-red-200 text-red-900 font-bold"
            : "bg-muted/40 border-border"
        }`}
      >
        <span className="font-mono">{label}</span>
        <span className="font-mono text-right break-all max-w-[55%]">{value}</span>
      </div>
    );
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 font-sans">
      <h1 className="text-lg font-bold">PWA Debug</h1>
      <p className="text-xs text-muted-foreground">
        Open this page on your mobile device. Share a screenshot if the Install
        button is not appearing.
      </p>

      {/* beforeinstallprompt result */}
      <div
        className={`p-4 rounded-xl border text-sm font-semibold ${
          promptFired
            ? "bg-green-100 border-green-400 text-green-900"
            : installable === false
            ? "bg-red-100 border-red-400 text-red-900"
            : "bg-amber-100 border-amber-400 text-amber-900"
        }`}
      >
        {promptFired
          ? "✅ beforeinstallprompt FIRED — PWA CAN be installed"
          : installable === false
          ? "❌ beforeinstallprompt DID NOT FIRE after 5s — PWA cannot be installed via prompt"
          : "⏳ Waiting for beforeinstallprompt (5s)..."}
      </div>

      {/* Core diagnostics */}
      <div className="space-y-1">
        {Object.entries(info).map(([k, v]) => (
          <Row key={k} label={k} value={v} />
        ))}
      </div>

      {/* Service worker */}
      <div className="p-3 rounded border bg-muted/30 text-xs font-mono break-all">
        <span className="font-bold">Service Worker:</span> {swState}
      </div>

      {/* Diagnosis */}
      {info["isSecureContext"] === "false" && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
          <p className="font-bold">⚠ isSecureContext is FALSE</p>
          {info["protocol"] === "http:" ? (
            <p>
              You are on <strong>HTTP</strong>. Open{" "}
              <a
                href={`https://${info["hostname"]}/dashboard`}
                className="underline font-bold"
              >
                https://{info["hostname"]}
              </a>{" "}
              instead.
            </p>
          ) : (
            <p>
              You are on HTTPS but the certificate is <strong>not trusted</strong> by Chrome.
              This happens on Android 7+ because Chrome does not trust user-installed CA
              certificates from Settings. See the fix below.
            </p>
          )}
        </div>
      )}

      {/* Android 7+ cert fix */}
      {info["isSecureContext"] === "false" && info["protocol"] === "https:" && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
          <p className="font-bold">Android 7+ Chrome Certificate Fix</p>
          <p>
            Chrome on Android 7+ ignores user-installed CA certs. You need to
            install the CA as a <strong>System certificate</strong>, which requires
            one of:
          </p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>Enable Developer Options → check your Android version</li>
            <li>OR: ask your IT admin to push the cert via MDM</li>
            <li>
              OR: use the HTTP shortcut workaround below
            </li>
          </ol>
          <p className="font-semibold pt-1">Workaround (no cert needed):</p>
          <p>
            In Chrome, open{" "}
            <code className="bg-amber-100 px-1 rounded">
              http://{info["hostname"]}:3000/dashboard
            </code>
            , then tap menu ⋮ → <strong>Add to Home Screen</strong>. This
            installs as a shortcut (Chrome icon visible) rather than a true
            standalone PWA.
          </p>
        </div>
      )}

      {/* Manifest link */}
      <a
        href="/manifest.webmanifest"
        className="block text-center text-xs underline text-primary"
        target="_blank"
        rel="noopener noreferrer"
      >
        View raw manifest.webmanifest
      </a>
    </div>
  );
}
