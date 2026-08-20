export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex-1 flex" style={{ minHeight: "100vh" }}>
      <div
        className="flex-1 flex flex-col justify-center relative"
        style={{
          background: "var(--color-accent-2-100)",
          padding: 70,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "var(--color-accent-2-200)",
            opacity: 0.6,
            top: -80,
            left: -80,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "var(--color-accent-2-300)",
            opacity: 0.5,
            bottom: -60,
            right: 40,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 19,
            color: "var(--color-accent-2-900)",
            marginBottom: 35,
            position: "relative",
          }}
        >
          Tailmap
        </span>
        <h1
          style={{
            maxWidth: 480,
            position: "relative",
            color: "var(--color-text)",
          }}
        >
          Find your dog&apos;s people
        </h1>
        <p
          style={{
            maxWidth: 420,
            position: "relative",
            color: "var(--color-accent-2-900)",
          }}
        >
          Every park gets a grade built from the dogs actually there — matched
          against who your dog loves to play with, and who they&apos;d rather
          avoid.
        </p>
      </div>
      <div
        className="flex-1 flex items-center justify-center"
        style={{ padding: 70, background: "var(--color-bg)" }}
      >
        <div style={{ width: "100%", maxWidth: 360 }}>{children}</div>
      </div>
    </div>
  );
}
