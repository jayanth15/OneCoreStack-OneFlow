import { Metadata } from "next";

export const metadata: Metadata = {
  title: "OneFlow — Device Setup",
};

export default function SetupPage() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">OneFlow Device Setup</h1>
          <p className="text-sm text-muted-foreground">
            Install the OneFlow certificate so the app works properly as a PWA
            (full-screen, no browser bar).
          </p>
        </div>

        {/* Android 7+ limitation warning */}
        <div className="border border-amber-300 rounded-xl p-4 bg-amber-50 dark:bg-amber-950/30 space-y-2">
          <p className="text-xs font-bold text-amber-900 dark:text-amber-200">⚠ Important for Android 7+</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Chrome on Android 7 and above <strong>ignores user-installed CA certificates</strong>.
            Installing the cert via Settings will not make Chrome trust it. This means the
            &ldquo;Install App&rdquo; prompt will not appear when opening the HTTPS link.
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            ✅ Easiest workaround — no certificate needed:
          </p>
          <ol className="text-xs text-amber-800 dark:text-amber-300 list-decimal list-inside space-y-1 pl-1">
            <li>Open the app on <strong>HTTP</strong> (port 3000) in Chrome</li>
            <li>Tap the Chrome menu <strong>⋮</strong> → <strong>Add to Home Screen</strong></li>
            <li>This installs a shortcut (Chrome icon visible). For a true standalone PWA, a system cert is required.</li>
          </ol>
          <a
            href="#"
            id="http-link"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
          >
            Open OneFlow on HTTP (port 3000)
          </a>
          <script dangerouslySetInnerHTML={{
            __html: `(function(){var a=document.getElementById('http-link');if(a)a.href='http://'+location.hostname+':3000/dashboard';})();`
          }} />
        </div>

        <div className="border rounded-xl p-5 space-y-4 bg-card">
          <h2 className="font-semibold text-lg">Step 1 — Install Certificate</h2>
          <p className="text-sm text-muted-foreground">
            Download and install the OneFlow CA certificate on this device.
            This lets Chrome trust the secure connection.{" "}
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              (Only effective on Android 6 and below, iOS, or desktop browsers.)
            </span>
          </p>
          <a
            href="/oneflow-ca.crt"
            download="oneflow-ca.crt"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Download Certificate
          </a>

          <div className="text-xs text-muted-foreground space-y-2 border-t pt-3">
            <p className="font-semibold text-foreground">After downloading:</p>
            <details className="space-y-1">
              <summary className="cursor-pointer font-medium text-foreground">
                Android (6 and below — user cert works)
              </summary>
              <ol className="list-decimal list-inside space-y-1 pl-2 pt-1">
                <li>
                  Go to <strong>Settings → Security → Encryption &amp;
                  credentials</strong>
                </li>
                <li>
                  Tap <strong>Install a certificate → CA certificate</strong>
                </li>
                <li>Tap <strong>Install anyway</strong> when warned</li>
                <li>Select the downloaded <code>oneflow-ca.crt</code> file</li>
                <li>Done — Chrome now trusts OneFlow&apos;s HTTPS</li>
              </ol>
            </details>
            <details className="space-y-1">
              <summary className="cursor-pointer font-medium text-foreground">
                Android 7+ via Developer Options (advanced)
              </summary>
              <p className="pl-2 pt-1 text-muted-foreground">
                To force Chrome to trust the cert on Android 7+, it must be in the <strong>system</strong> trust store.
                This requires either root access, ADB debug mode, or an MDM policy push.
                For most users, the HTTP workaround above is simpler.
              </p>
            </details>
            <details className="space-y-1">
              <summary className="cursor-pointer font-medium text-foreground">
                iPhone / iPad
              </summary>
              <ol className="list-decimal list-inside space-y-1 pl-2 pt-1">
                <li>
                  After downloading, go to{" "}
                  <strong>Settings → General → VPN &amp; Device Management</strong>
                </li>
                <li>
                  Tap the <strong>OneFlow Local CA</strong> profile → Install
                </li>
                <li>
                  Then go to{" "}
                  <strong>
                    Settings → General → About → Certificate Trust Settings
                  </strong>
                </li>
                <li>
                  Toggle ON <strong>OneFlow Local CA</strong>
                </li>
              </ol>
            </details>
            <details className="space-y-1">
              <summary className="cursor-pointer font-medium text-foreground">
                Windows / Mac / Linux
              </summary>
              <p className="pl-2 pt-1">
                The browser will show a certificate warning on first visit —
                click <strong>Advanced → Proceed</strong>. Or import the
                certificate into your OS trust store for no warnings.
              </p>
            </details>
          </div>
        </div>

        <div className="border rounded-xl p-5 space-y-4 bg-card">
          <h2 className="font-semibold text-lg">Step 2 — Open OneFlow</h2>
          <p className="text-sm text-muted-foreground">
            After installing the certificate (iOS / Android 6 &amp; below), open OneFlow using
            the HTTPS address. Chrome will show the <strong>&ldquo;Install app&rdquo;</strong> prompt automatically.
          </p>
          <a
            href="#"
            id="open-link"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            Open OneFlow (HTTPS)
          </a>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  var a = document.getElementById('open-link');
                  if (a) a.href = 'https://' + location.hostname + '/dashboard';
                })();
              `,
            }}
          />
        </div>
      </div>
    </div>
  );
}
