import { useState, useEffect } from "react";

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
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "var(--app-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round">
            <polyline points="4 14 8 10 4 6"/>
            <line x1="10" y1="15" x2="16" y2="15"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: -0.3 }}>SSH Manager</span>
      </div>

      {/* Links */}
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {["Features", "Security", "Changelog"].map((item) => (
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
        <div style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "var(--app-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round">
            <polyline points="4 14 8 10 4 6"/>
            <line x1="10" y1="15" x2="16" y2="15"/>
          </svg>
        </div>
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
        <CTA />
      </main>
      <Footer />
    </>
  );
}
