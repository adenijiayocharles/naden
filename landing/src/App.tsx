import { useState, useEffect, type ReactNode } from "react";

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconTerminal({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconFolder({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconKey({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3L21 8l-3-3" />
    </svg>
  );
}

function IconShield({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconZap({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconTag({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function IconClock({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconGlobe({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconDownload({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconGithub({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function IconLayers({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}


// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      height: 60,
      display: "flex",
      alignItems: "center",
      paddingLeft: "max(24px, calc(50vw - 620px))",
      paddingRight: "max(24px, calc(50vw - 620px))",
      background: scrolled ? "color-mix(in srgb, var(--bg-0) 85%, transparent)" : "transparent",
      backdropFilter: scrolled ? "blur(12px)" : "none",
      borderBottom: scrolled ? "1px solid var(--stroke-subtle)" : "1px solid transparent",
      transition: "background 0.2s, border-color 0.2s, backdrop-filter 0.2s",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <img src="/server.png" alt="SSH Manager" style={{ width: 28, height: 28 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.3 }}>SSH Manager</span>
      </div>

      {/* Links */}
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {["Features", "Security", "Docs", "Changelog"].map((item) => (
          <a key={item} href={`#${item.toLowerCase()}`} style={{
            fontSize: 14,
            color: "var(--text-muted)",
            textDecoration: "none",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "var(--text-muted)"; }}
          >{item}</a>
        ))}
        <a href="#download" style={{
          height: 32,
          paddingLeft: 14,
          paddingRight: 14,
          borderRadius: 7,
          background: "var(--accent-green)",
          color: "#0d0d0d",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          <IconDownload size={14} />
          Download
        </a>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px max(24px, calc(50vw - 620px)) 40px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Glow */}
      <div style={{
        position: "absolute",
        top: "15%",
        left: "50%",
        transform: "translateX(-50%)",
        width: 700,
        height: 400,
        background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent-green) 12%, transparent) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Badge */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px 4px 8px",
        borderRadius: 100,
        background: "color-mix(in srgb, var(--accent-green) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)",
        marginBottom: 28,
      }}>
        <span style={{ fontSize: 10, background: "var(--accent-green)", color: "#0d0d0d", borderRadius: 100, padding: "1px 6px", fontWeight: 700 }}>NEW</span>
        <span style={{ fontSize: 13, color: "var(--accent-green)" }}>Local SFTP browser — no sync needed</span>
      </div>

      {/* Headline */}
      <h1 style={{
        fontSize: "clamp(40px, 6vw, 68px)",
        fontWeight: 700,
        letterSpacing: -2,
        lineHeight: 1.08,
        textAlign: "center",
        color: "var(--text-primary)",
        maxWidth: 780,
        marginBottom: 22,
      }}>
        SSH done right,{" "}
        <span style={{
          background: "linear-gradient(135deg, var(--accent-green) 0%, #a3e635 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>every time.</span>
      </h1>

      <p style={{
        fontSize: 18,
        color: "var(--text-secondary)",
        textAlign: "center",
        maxWidth: 520,
        lineHeight: 1.65,
        marginBottom: 36,
      }}>
        A fast, private desktop SSH client with a built-in terminal, side-by-side SFTP browser, and an encrypted credential vault — all in one native macOS app.
      </p>

      {/* CTA buttons */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 56 }}>
        <a href="#download" style={{
          height: 44,
          paddingLeft: 22,
          paddingRight: 22,
          borderRadius: 10,
          background: "var(--accent-green)",
          color: "#0d0d0d",
          fontSize: 15,
          fontWeight: 700,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "opacity 0.15s, transform 0.15s",
        }}
        onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.opacity = "0.88"; el.style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.opacity = "1"; el.style.transform = "none"; }}
        >
          <IconDownload size={16} />
          Download for macOS
        </a>
        <a href="https://github.com" style={{
          height: 44,
          paddingLeft: 20,
          paddingRight: 20,
          borderRadius: 10,
          background: "var(--bg-3)",
          border: "1px solid var(--stroke)",
          color: "var(--text-secondary)",
          fontSize: 15,
          fontWeight: 500,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--text-primary)"; el.style.borderColor = "var(--stroke)"; }}
        onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--text-secondary)"; }}
        >
          <IconGithub size={16} />
          View on GitHub
        </a>
      </div>

      {/* App preview — Terminal */}
      <div style={{
        width: "100%",
        maxWidth: 960,
        position: "relative",
      }}>
        <img
          src="/screenshot-terminal.png"
          alt="SSH Manager terminal session"
          style={{
            width: "100%",
            display: "block",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
        {/* Fade out at bottom */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 120,
          background: "linear-gradient(to top, var(--bg-0), transparent)",
          pointerEvents: "none",
        }} />
      </div>
    </section>
  );
}

// ── SFTP Screenshot Section ───────────────────────────────────────────────────

function SftpSection() {
  return (
    <section id="features" style={{
      padding: "100px max(24px, calc(50vw - 620px))",
    }}>
      {/* Section label */}
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 16,
          padding: "4px 12px",
          borderRadius: 100,
          background: "var(--bg-3)",
          border: "1px solid var(--stroke)",
        }}>
          <IconFolder size={13} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>SFTP Browser</span>
        </div>
        <h2 style={{
          fontSize: "clamp(28px, 4vw, 44px)",
          fontWeight: 700,
          letterSpacing: -1.2,
          color: "var(--text-primary)",
          marginBottom: 14,
        }}>
          Browse and transfer files{" "}
          <span style={{ color: "var(--accent-green)" }}>side by side.</span>
        </h2>
        <p style={{ fontSize: 17, color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
          Dual-pane SFTP with drag-and-drop uploads, in-place editing, and permission management — no separate FTP client needed.
        </p>
      </div>

      {/* App preview — SFTP */}
      <img
        src="/screenshot-sftp.png"
        alt="SSH Manager SFTP file browser"
        style={{
          width: "100%",
          display: "block",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.5)",
        }}
      />

      {/* Feature bullets */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 24,
        marginTop: 48,
      }}>
        {[
          { label: "Side-by-side local & remote",  desc: "Work with local and remote directories in split view. Drag files between panes." },
          { label: "In-place file editing",         desc: "Open remote files in any local app, then auto-upload on save via file watching." },
          { label: "Permission management",         desc: "Click any permission string to open the chmod dialog with octal and symbolic input." },
        ].map((item) => (
          <div key={item.label} style={{
            padding: "20px 24px",
            borderRadius: 10,
            background: "var(--bg-2)",
            border: "1px solid var(--stroke-subtle)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <div style={{ color: "var(--accent-green)", flexShrink: 0 }}>
                <IconCheck size={14} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Features Grid ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <IconTerminal size={22} />,
    title: "Built-in terminal",
    desc: "Full xterm.js terminal with multi-tab sessions, search, copy-on-select, and configurable fonts.",
    accent: "#CDFF00",
  },
  {
    icon: <IconFolder size={22} />,
    title: "SFTP browser",
    desc: "Dual-pane file manager with drag-and-drop, batch operations, and in-place editing with file-watch upload.",
    accent: "#60a5fa",
  },
  {
    icon: <IconShield size={22} />,
    title: "Encrypted vault",
    desc: "AES-256 credential vault protected by a master password. Unlock with Touch ID on supported Macs.",
    accent: "#f87171",
  },
  {
    icon: <IconSearch size={22} />,
    title: "Fuzzy search",
    desc: "Real-time fuzzy search across all servers — by name, host, tag, or group. Results in under 100 ms.",
    accent: "#fbbf24",
  },
  {
    icon: <IconLayers size={22} />,
    title: "Jump host support",
    desc: "Multi-hop SSH through bastion hosts. Configure jump chains per server with independent credentials.",
    accent: "#a78bfa",
  },
  {
    icon: <IconKey size={22} />,
    title: "Key management",
    desc: "Import SSH private keys (RSA, Ed25519, ECDSA). Keys are stored encrypted and never written in plain text.",
    accent: "#34d399",
  },
  {
    icon: <IconTag size={22} />,
    title: "Tags & groups",
    desc: "Organise servers into color-coded groups with arbitrary tags. Filter the list in one keystroke.",
    accent: "#fb923c",
  },
  {
    icon: <IconGlobe size={22} />,
    title: "SSH config import",
    desc: "Import servers from your ~/.ssh/config with one click. Keeps ProxyJump and IdentityFile entries.",
    accent: "#38bdf8",
  },
  {
    icon: <IconClock size={22} />,
    title: "Audit log",
    desc: "Tamper-evident connection log with CSV export. Know exactly who connected where and when.",
    accent: "#e879f9",
  },
];

function FeaturesGrid() {
  return (
    <section id="security" style={{
      padding: "80px max(24px, calc(50vw - 620px)) 100px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <h2 style={{
          fontSize: "clamp(28px, 4vw, 44px)",
          fontWeight: 700,
          letterSpacing: -1.2,
          color: "var(--text-primary)",
          marginBottom: 14,
        }}>Everything you need, nothing you don't.</h2>
        <p style={{ fontSize: 17, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto", lineHeight: 1.65 }}>
          Focused on the workflows that matter: connect, browse, and transfer. Fast and private by default.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 20,
      }}>
        {FEATURES.map((f) => (
          <div key={f.title} style={{
            padding: "24px",
            borderRadius: 12,
            background: "var(--bg-2)",
            border: "1px solid var(--stroke-subtle)",
            transition: "border-color 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `color-mix(in srgb, ${f.accent} 30%, transparent)`; el.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--stroke-subtle)"; el.style.transform = "none"; }}
          >
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `color-mix(in srgb, ${f.accent} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${f.accent} 20%, transparent)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: f.accent,
              marginBottom: 14,
            }}>
              {f.icon}
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{f.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Vault Section ─────────────────────────────────────────────────────────────

function VaultSection() {
  return (
    <section style={{
      padding: "80px max(24px, calc(50vw - 620px))",
      background: "var(--bg-1)",
      borderTop: "1px solid var(--stroke-subtle)",
      borderBottom: "1px solid var(--stroke-subtle)",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 64,
        alignItems: "center",
      }}>
        {/* Text */}
        <div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 20,
            padding: "4px 12px",
            borderRadius: 100,
            background: "color-mix(in srgb, #f87171 10%, transparent)",
            border: "1px solid color-mix(in srgb, #f87171 25%, transparent)",
          }}>
            <IconShield size={13} />
            <span style={{ fontSize: 12, color: "#f87171", fontWeight: 500 }}>CREDENTIAL VAULT</span>
          </div>
          <h2 style={{
            fontSize: "clamp(26px, 3.5vw, 40px)",
            fontWeight: 700,
            letterSpacing: -1,
            color: "var(--text-primary)",
            marginBottom: 16,
            lineHeight: 1.15,
          }}>
            Passwords and keys,{" "}
            <span style={{ color: "#f87171" }}>encrypted at rest.</span>
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 28 }}>
            Every credential is wrapped with AES-256-GCM before hitting disk. The vault key never leaves memory as plain bytes — it's stored in a <code style={{ fontFamily: "var(--font-mono)", fontSize: 14, background: "var(--bg-3)", padding: "1px 5px", borderRadius: 4 }}>Zeroizing</code> wrapper that wipes on drop.
          </p>
          {[
            "Touch ID unlock on supported Macs",
            "Auto-lock after configurable idle timeout",
            "Brute-force protection with exponential backoff",
            "Master password can be disabled for key-only setups",
          ].map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ color: "#f87171", marginTop: 1, flexShrink: 0 }}><IconCheck size={14} /></div>
              <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Vault screenshot */}
        <img
          src="/screenshot-vault.png"
          alt="SSH Manager credential vault settings"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            width: "100%",
            display: "block",
          }}
        />
      </div>
    </section>
  );
}

// ── Docs ──────────────────────────────────────────────────────────────────────

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      background: "var(--bg-3)",
      border: "1px solid var(--stroke)",
      borderBottom: "2px solid var(--stroke)",
      borderRadius: 4,
      padding: "2px 7px",
      color: "var(--text-secondary)",
      whiteSpace: "nowrap",
    }}>{children}</kbd>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code style={{
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      background: "var(--bg-3)",
      border: "1px solid var(--stroke-subtle)",
      borderRadius: 4,
      padding: "1px 6px",
      color: "var(--accent-green)",
    }}>{children}</code>
  );
}

function DocH3({ children }: { children: ReactNode }) {
  return (
    <h3 style={{
      fontSize: 15,
      fontWeight: 600,
      color: "var(--text-primary)",
      letterSpacing: -0.2,
      marginTop: 28,
      marginBottom: 8,
    }}>{children}</h3>
  );
}

function DocP({ children }: { children: ReactNode }) {
  return (
    <p style={{
      fontSize: 14,
      color: "var(--text-secondary)",
      lineHeight: 1.75,
      marginBottom: 12,
    }}>{children}</p>
  );
}

function DocStep({ n, accent = "var(--accent-green)", children }: { n: string; accent?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
      <div style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        color: accent,
        flexShrink: 0,
        marginTop: 2,
      }}>{n}</div>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.75, margin: 0 }}>{children}</p>
    </div>
  );
}

function DocsSection() {
  const [activeId, setActiveId] = useState("quickstart");

  const navItems = [
    { id: "quickstart", icon: <IconZap size={14} />,     label: "Quick Start" },
    { id: "shortcuts",  icon: <IconKey size={14} />,      label: "Shortcuts" },
    { id: "terminal",   icon: <IconTerminal size={14} />, label: "Terminal" },
    { id: "sftp",       icon: <IconFolder size={14} />,   label: "SFTP Browser" },
    { id: "vault",      icon: <IconShield size={14} />,   label: "Credential Vault" },
    { id: "jumphost",   icon: <IconLayers size={14} />,   label: "Jump Hosts" },
    { id: "sshconfig",  icon: <IconGlobe size={14} />,    label: "SSH Config Import" },
    { id: "auditlog",   icon: <IconClock size={14} />,    label: "Audit Log" },
  ];

  function renderContent() {
    switch (activeId) {
      case "quickstart": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>Getting started</h2>
          <DocP>Get an active SSH session in under a minute — no config files to edit by hand.</DocP>
          {[
            {
              n: "1",
              title: "Add a server",
              body: <>Click <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>+ New Server</strong> in the sidebar, enter a hostname, port (default 22), and username. Or use <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>File → Import SSH Config</strong> to pull all hosts from <InlineCode>~/.ssh/config</InlineCode> at once.</>,
            },
            {
              n: "2",
              title: "Set up the vault",
              body: <>On first launch, SSH Manager asks you to create a master password. This derives the AES-256 vault key and is never stored on disk. Add a password or key passphrase in the server's <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Credentials</strong> tab.</>,
            },
            {
              n: "3",
              title: "Connect",
              body: <>Click any server in the sidebar to open a terminal session. Additional connections open as new tabs. Use <Kbd>⌘K</Kbd> to search across all servers at any time.</>,
            },
          ].map(({ n, title, body }) => (
            <div key={n} style={{
              display: "flex",
              gap: 16,
              padding: "16px 20px",
              background: "var(--bg-3)",
              borderRadius: 10,
              border: "1px solid var(--stroke-subtle)",
              marginBottom: 10,
            }}>
              <div style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--accent-green) 15%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent-green)",
                flexShrink: 0,
                marginTop: 1,
              }}>{n}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>{title}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      );

      case "shortcuts": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>Keyboard shortcuts</h2>
          <DocP>⌘ refers to the Command key on macOS.</DocP>
          {[
            {
              group: "Global",
              rows: [
                { keys: "⌘K", action: "Open fuzzy search" },
                { keys: "⌘N", action: "Add new server" },
                { keys: "⌘,", action: "Open settings" },
              ],
            },
            {
              group: "Terminal",
              rows: [
                { keys: "⌘F", action: "Find in terminal" },
                { keys: "⌘C", action: "Copy selection" },
                { keys: "⌘V", action: "Paste" },
              ],
            },
          ].map(({ group, rows }) => (
            <div key={group} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 8,
              }}>{group}</div>
              <div style={{ borderRadius: 8, border: "1px solid var(--stroke-subtle)", overflow: "hidden" }}>
                {rows.map(({ keys, action }, i) => (
                  <div key={keys} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: i % 2 === 0 ? "var(--bg-2)" : "var(--bg-3)",
                  }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{action}</span>
                    <Kbd>{keys}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );

      case "terminal": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>Terminal</h2>
          <DocP>SSH Manager embeds a full <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>xterm.js</strong> terminal — every session runs natively in-app with no external emulator required.</DocP>

          <DocH3>Multi-tab sessions</DocH3>
          <DocP>Open up to 20 simultaneous SSH sessions as tabs. Drag tabs to reorder. Click <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>+</strong> in the tab bar to start a new session to any server.</DocP>

          <DocH3>Find in terminal</DocH3>
          <DocP>Press <Kbd>⌘F</Kbd> to open the search overlay. Matches highlight as you type. Use <Kbd>↩</Kbd> and <Kbd>⇧↩</Kbd> to step forward and backward through results.</DocP>

          <DocH3>Copy on select</DocH3>
          <DocP>Selecting text copies it to the clipboard automatically. Right-click or press <Kbd>⌘V</Kbd> to paste.</DocP>

          <DocH3>Font settings</DocH3>
          <DocP>Go to <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Settings → Terminal</strong> to set a custom font family and size. Defaults to JetBrains Mono 13 px. Changes apply immediately to all open sessions.</DocP>
        </div>
      );

      case "sftp": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>SFTP browser</h2>
          <DocP>A dual-pane file manager built into SSH Manager — local filesystem on the left, remote server on the right. No separate FTP client needed.</DocP>

          <DocH3>Opening the browser</DocH3>
          <DocP>While connected to a server, click the <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>folder icon</strong> in the top toolbar to open the SFTP pane for that session.</DocP>

          <DocH3>Uploading and downloading</DocH3>
          <DocP>Drag files from the local pane to the remote pane to upload, or the other direction to download. Right-click any file for explicit <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Upload</strong> or <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Download</strong> options.</DocP>

          <DocH3>In-place editing</DocH3>
          <DocP>Double-click any remote file to open it in your default local app. SSH Manager watches the local temp copy and automatically re-uploads it the moment you save — no manual transfer required.</DocP>

          <DocH3>Permissions (chmod)</DocH3>
          <DocP>Click any permission string (e.g. <InlineCode>rwxr-xr-x</InlineCode>) to open the chmod dialog. Enter an octal code like <InlineCode>755</InlineCode>, or toggle individual bits using the checkbox grid.</DocP>
        </div>
      );

      case "vault": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>Credential vault</h2>
          <DocP>Every credential is encrypted with <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>AES-256-GCM</strong> before touching disk. The vault key is derived from your master password via PBKDF2 — it is never stored anywhere.</DocP>

          <DocH3>First-time setup</DocH3>
          <DocP>SSH Manager prompts you to create a master password on first launch. Choose something strong — this is the sole key to your stored credentials.</DocP>

          <DocH3>Touch ID</DocH3>
          <DocP>Go to <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Settings → Vault → Enable Touch ID</strong>. Once enabled, SSH Manager uses biometrics to unlock instead of typing your master password. Requires a Mac with Touch ID hardware.</DocP>

          <DocH3>Auto-lock</DocH3>
          <DocP>Configure the idle timeout in <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Settings → Vault</strong>. SSH Manager locks automatically when you step away.</DocP>

          <DocH3>Changing your password</DocH3>
          <DocP>Go to <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Settings → Vault → Change Master Password</strong>. All credentials are transparently re-encrypted with the new key.</DocP>
        </div>
      );

      case "jumphost": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>Jump hosts</h2>
          <DocP>SSH Manager supports multi-hop tunneling through bastion servers. Each hop in the chain uses its own vault credentials independently.</DocP>

          <DocH3>Setup</DocH3>
          <DocStep n="1" accent="#a78bfa">Add the bastion server as a normal server entry in SSH Manager.</DocStep>
          <DocStep n="2" accent="#a78bfa">Open the bastion's settings and enable <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>"Use as jump host"</strong>.</DocStep>
          <DocStep n="3" accent="#a78bfa">Edit your target server and select the bastion from the <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Jump host</strong> dropdown in the Connection section.</DocStep>
          <DocStep n="4" accent="#a78bfa">Connect to the target normally — SSH Manager resolves the proxy chain automatically.</DocStep>

          <DocH3>Multi-hop chains</DocH3>
          <DocP>Chain up to three hops (A → B → C) by assigning a jump host that itself has a jump host. Each server's credentials are resolved from the vault independently.</DocP>
        </div>
      );

      case "sshconfig": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>SSH Config Import</h2>
          <DocP>If you already manage servers in <InlineCode>~/.ssh/config</InlineCode>, import them all into SSH Manager with a single click.</DocP>

          <DocH3>How to import</DocH3>
          <DocStep n="1" accent="#38bdf8">Go to <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>File → Import SSH Config</strong>. SSH Manager reads <InlineCode>~/.ssh/config</InlineCode> automatically.</DocStep>
          <DocStep n="2" accent="#38bdf8">Review the preview of all detected hosts. Uncheck any you don't want to import.</DocStep>
          <DocStep n="3" accent="#38bdf8">Click <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Import</strong>. New servers appear in the sidebar under "Ungrouped".</DocStep>

          <DocH3>What's preserved</DocH3>
          <div style={{ borderRadius: 8, border: "1px solid var(--stroke-subtle)", overflow: "hidden", marginBottom: 16 }}>
            {[
              { field: "ProxyJump",  desc: "Converted to jump host assignments" },
              { field: "IdentityFile", desc: "Path retained in server settings" },
              { field: "Port / User",  desc: "Imported as-is" },
            ].map(({ field, desc }, i) => (
              <div key={field} style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 12,
                padding: "10px 14px",
                background: i % 2 === 0 ? "var(--bg-2)" : "var(--bg-3)",
                alignItems: "center",
              }}>
                <InlineCode>{field}</InlineCode>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{desc}</span>
              </div>
            ))}
          </div>

          <DocH3>Deduplication</DocH3>
          <DocP>Existing servers with the same hostname and username are not duplicated on re-import.</DocP>
        </div>
      );

      case "auditlog": return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 6 }}>Audit log</h2>
          <DocP>Every connection attempt is recorded locally. No data leaves your machine.</DocP>

          <DocH3>What's logged</DocH3>
          <div style={{ borderRadius: 8, border: "1px solid var(--stroke-subtle)", overflow: "hidden", marginBottom: 16 }}>
            {[
              { field: "Timestamp",  desc: "Date and time of the connection attempt" },
              { field: "Server",     desc: "Display name as configured in SSH Manager" },
              { field: "Hostname",   desc: "Host and port used for the connection" },
              { field: "Username",   desc: "SSH username for the session" },
              { field: "Duration",   desc: "Total session time for successful connections" },
              { field: "Outcome",    desc: "connected, failed, or disconnected" },
            ].map(({ field, desc }, i) => (
              <div key={field} style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr",
                gap: 12,
                padding: "10px 14px",
                background: i % 2 === 0 ? "var(--bg-2)" : "var(--bg-3)",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{field}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{desc}</span>
              </div>
            ))}
          </div>

          <DocH3>Viewing the log</DocH3>
          <DocP>Click the <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>clock icon</strong> in the sidebar to open the Audit Log. Use the search bar to filter by server name or hostname. Click any column header to sort.</DocP>

          <DocH3>Exporting to CSV</DocH3>
          <DocP>Click <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Export CSV</strong> in the toolbar to download the full history as a comma-separated file — useful for compliance records or spreadsheet analysis.</DocP>
        </div>
      );

      default: return null;
    }
  }

  return (
    <section id="docs" style={{
      padding: "80px max(24px, calc(50vw - 620px)) 100px",
      borderTop: "1px solid var(--stroke-subtle)",
    }}>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 16,
          padding: "4px 12px",
          borderRadius: 100,
          background: "var(--bg-3)",
          border: "1px solid var(--stroke)",
        }}>
          <IconSearch size={13} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>DOCUMENTATION</span>
        </div>
        <h2 style={{
          fontSize: "clamp(28px, 4vw, 44px)",
          fontWeight: 700,
          letterSpacing: -1.2,
          color: "var(--text-primary)",
          marginBottom: 14,
        }}>
          Everything you need to know.
        </h2>
        <p style={{ fontSize: 17, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto", lineHeight: 1.65 }}>
          Guides and references for every feature in SSH Manager.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        background: "var(--bg-1)",
        borderRadius: 14,
        border: "1px solid var(--stroke-subtle)",
        overflow: "hidden",
        minHeight: 500,
      }}>
        {/* Sidebar nav */}
        <nav style={{
          borderRight: "1px solid var(--stroke-subtle)",
          padding: "8px 0",
        }}>
          {navItems.map(({ id, icon, label }) => {
            const active = activeId === id;
            return (
              <button
                key={id}
                onClick={() => setActiveId(id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 16px",
                  background: active ? "var(--bg-3)" : "transparent",
                  border: "none",
                  borderLeft: `2px solid ${active ? "var(--accent-green)" : "transparent"}`,
                  cursor: "pointer",
                  textAlign: "left",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  transition: "color 0.12s, background 0.12s",
                  fontFamily: "var(--font-sans)",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0 }}>{icon}</span>
                {label}
              </button>
            );
          })}
        </nav>

        {/* Content pane */}
        <div style={{ padding: "32px 40px", overflowY: "auto" }}>
          {renderContent()}
        </div>
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section id="download" style={{
      padding: "100px max(24px, calc(50vw - 620px)) 80px",
      textAlign: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute",
        top: "30%",
        left: "50%",
        transform: "translateX(-50%)",
        width: 600,
        height: 300,
        background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent-green) 10%, transparent) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <h2 style={{
        fontSize: "clamp(32px, 5vw, 56px)",
        fontWeight: 700,
        letterSpacing: -1.5,
        color: "var(--text-primary)",
        marginBottom: 16,
        position: "relative",
      }}>
        Start connecting.
      </h2>
      <p style={{
        fontSize: 18,
        color: "var(--text-secondary)",
        maxWidth: 440,
        margin: "0 auto 36px",
        lineHeight: 1.65,
        position: "relative",
      }}>
        Free, open source, and built for the terminal-first workflow. macOS 13 Ventura or later.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", position: "relative" }}>
        <a href="#download" style={{
          height: 48,
          paddingLeft: 28,
          paddingRight: 28,
          borderRadius: 11,
          background: "var(--accent-green)",
          color: "#0d0d0d",
          fontSize: 16,
          fontWeight: 700,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 9,
          transition: "opacity 0.15s, transform 0.15s",
        }}
        onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.opacity = "0.88"; el.style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.opacity = "1"; el.style.transform = "none"; }}
        >
          <IconDownload size={18} />
          Download for macOS
        </a>
        <a href="https://github.com" style={{
          height: 48,
          paddingLeft: 22,
          paddingRight: 22,
          borderRadius: 11,
          background: "var(--bg-3)",
          border: "1px solid var(--stroke)",
          color: "var(--text-secondary)",
          fontSize: 16,
          fontWeight: 500,
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 9,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          <IconGithub size={18} />
          View source
        </a>
      </div>
      <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)", position: "relative" }}>
        Requires macOS 13 Ventura · Apple Silicon &amp; Intel · ~8 MB download
      </p>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid var(--stroke-subtle)",
      padding: "28px max(24px, calc(50vw - 620px))",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img src="/server.png" alt="SSH Manager" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>SSH Manager · Built with Tauri + React + Rust</span>
      </div>
      <div style={{ display: "flex", gap: 22 }}>
        {["GitHub", "Changelog", "License"].map((link) => (
          <a key={link} href="#" style={{
            fontSize: 13,
            color: "var(--text-muted)",
            textDecoration: "none",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "var(--text-muted)"; }}
          >{link}</a>
        ))}
      </div>
    </footer>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      <Nav />
      <main>
        <Hero />
        <SftpSection />
        <FeaturesGrid />
        <VaultSection />
        <DocsSection />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
